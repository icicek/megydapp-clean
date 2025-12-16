// app/api/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cache, statusKey, STATUS_TTL } from '@/app/api/_lib/cache';
import type { TokenStatus } from '@/app/api/_lib/types';
import { verifyCsrf } from '@/app/api/_lib/csrf';

// registry (raw row + final decision helper)
import { getStatusRow, resolveEffectiveStatus } from '@/app/api/_lib/registry';

// compat (manual override)
import {
  getStatus as getTokenStatus,
  setStatus as upsertTokenStatus,
} from '@/app/api/_lib/token-registry';

// votes
import { sql } from '@/app/api/_lib/db';
import { getVoteThreshold } from '@/app/api/_lib/settings';

// thresholds
import { getTokenThresholds } from '@/app/api/_lib/token-thresholds';

// classification (metrics + usd)
import classifyToken from '@/app/api/utils/classifyToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isLockedDeadcoinRow(row: any): boolean {
  if (!row) return false;
  if (row.status !== 'deadcoin') return false;
  const m = row.meta ?? {};
  const src = m?.source ?? row.updated_by ?? null;
  return m?.lock_deadcoin === true || m?.lock?.deadcoin === true || src === 'community' || src === 'admin';
}

function isLockedListRow(row: any): boolean {
  if (!row) return false;
  if (row.status !== 'blacklist' && row.status !== 'redlist') return false;
  const m = row.meta ?? {};
  const src = m?.source ?? row.updated_by ?? null;
  return m?.lock_list === true || src === 'admin';
}

/**
 * GET /api/status?mint=...&includeMetrics=1
 */
export async function GET(req: NextRequest) {
  try {
    const mint = req.nextUrl.searchParams.get('mint')?.trim();
    if (!mint) {
      return NextResponse.json(
        { success: false, error: 'mint is required' },
        { status: 400 },
      );
    }

    const includeMetrics = req.nextUrl.searchParams.get('includeMetrics') === '1';

    /* -------------------------------------------------
     * 1) REGISTRY (raw)
     * ------------------------------------------------- */
    const row: any = await getStatusRow(mint);

    const registryStatus: TokenStatus | null = (row?.status ?? null) as TokenStatus | null;

    // source: meta.source yoksa updated_by/reason fallback
    const registrySource: string | null =
      row?.meta?.source ??
      row?.updated_by ??
      row?.reason ??
      null;

    const statusAt: string | null =
      row?.status_at ??
      row?.updated_at ??
      row?.created_at ??
      null;

    /* -------------------------------------------------
     * 2) COMMUNITY VOTES (live)
     * ------------------------------------------------- */
    const yesRows = (await sql`
      SELECT COUNT(*)::int AS c
      FROM deadcoin_votes
      WHERE mint = ${mint} AND vote_yes = TRUE
    `) as unknown as { c: number }[];

    const votesYes = yesRows[0]?.c ?? 0;
    const threshold = await getVoteThreshold();

    /* -------------------------------------------------
     * 3) ADMIN THRESHOLDS
     * ------------------------------------------------- */
    const thresholds = await getTokenThresholds();

    /* -------------------------------------------------
     * 4) METRICS + USD (optional)
     * ------------------------------------------------- */
    let metricsCategory: 'healthy' | 'walking_dead' | 'deadcoin' | null = null;
    let usdValue = 0;
    let metrics: any = null;

    if (includeMetrics) {
      try {
        // amount=1: sadece stat/metrics görmek için
        const cls = await classifyToken({ mint }, 1);

        // classifyToken: 'unknown' da dönebilir → resolver'a null veriyoruz
        metricsCategory =
          cls.category === 'healthy' || cls.category === 'walking_dead' || cls.category === 'deadcoin'
            ? cls.category
            : null;

        usdValue = Number(cls.usdValue ?? 0) || 0;

        metrics = {
          category: metricsCategory ?? cls.category,
          liquidity: cls.liquidity ?? null,
          volume: cls.volume ?? null,

          // ✅ doğru alanlar (sende bu şekilde kalsın)
          dexVolume: cls.volumeBreakdown?.dexVolumeUSD ?? null,
          cexVolume: cls.volumeBreakdown?.cexVolumeUSD ?? null,

          sources: cls.volumeSources ?? null,
        };
      } catch (e: any) {
        metricsCategory = null;
        usdValue = 0;
        metrics = { error: e?.message || 'metrics_failed' };
      }
    }

    /* -------------------------------------------------
     * 5) 🔑 EFFECTIVE STATUS (single source of truth)
     * ------------------------------------------------- */
    const status: TokenStatus = resolveEffectiveStatus({
      registryStatus,
      registrySource,
      metricsCategory,
      usdValue,
    });

    /* -------------------------------------------------
     * 6) CACHE
     * ------------------------------------------------- */
    try {
      cache.set(statusKey(mint), { status, statusAt });
    } catch {}

    /* -------------------------------------------------
     * 7) RESPONSE
     * ------------------------------------------------- */
    return NextResponse.json(
      {
        success: true,
        mint,

        status,
        statusAt,

        // debug / admin visibility
        registry: {
          status: registryStatus,
          source: registrySource,
        },

        votesYes,
        threshold,

        thresholds,

        metrics: includeMetrics ? metrics : undefined,
      },
      {
        headers: {
          'Cache-Control': `public, max-age=0, s-maxage=${STATUS_TTL}`,
        },
      },
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/status
 * (manual admin override)
 *
 * ✅ Adds: lock-safe guard (community/admin locked statuses cannot be reverted without force=1)
 * ✅ Adds: always stamps meta.source='admin' for PUT
 * ✅ Makes prev null-safe
 */
export async function PUT(req: NextRequest) {
  try {
    verifyCsrf(req);

    const body = await req.json();
    const {
      mint,
      status,
      reason = null,
      source = 'admin', // default
      force = false,
      meta = {},
      changedBy,
    } = body || {};

    const allowed: TokenStatus[] = [
      'healthy',
      'walking_dead',
      'deadcoin',
      'redlist',
      'blacklist',
    ];

    if (!mint || !status || !allowed.includes(status as TokenStatus)) {
      return NextResponse.json(
        { success: false, error: 'mint and valid status required' },
        { status: 400 },
      );
    }

    const prev = await getTokenStatus(mint); // may be null-ish depending on compat layer
    const prevStatus = (prev?.status ?? null) as TokenStatus | null;

    // Raw row for lock/meta checks (more reliable than compat getter)
    const row: any = await getStatusRow(mint);

    // ✅ LOCK-SAFE GUARD:
    // If currently locked (deadcoin by admin/community OR list by admin), block reverting unless force=1
    if (!force) {
      if (isLockedDeadcoinRow(row) && status !== 'deadcoin') {
        return NextResponse.json(
          {
            success: false,
            error: 'locked_deadcoin_requires_force',
            code: 'LOCKED_DEADCOIN',
            current: row?.status ?? prevStatus,
            requested: status,
          },
          { status: 409 },
        );
      }
      if (isLockedListRow(row) && (status === 'healthy' || status === 'walking_dead' || status === 'deadcoin')) {
        return NextResponse.json(
          {
            success: false,
            error: 'locked_list_requires_force',
            code: 'LOCKED_LIST',
            current: row?.status ?? prevStatus,
            requested: status,
          },
          { status: 409 },
        );
      }
    }

    const actor = (changedBy as string) || 'admin';

    const baseMeta = typeof meta === 'object' && meta ? meta : {};

    // ✅ Admin lock rules (write locks consistently)
    const lockPatch: any = {};

    if (status === 'deadcoin') {
      lockPatch.source = 'admin';
      lockPatch.lock_deadcoin = true;
      lockPatch.lock_reason = lockPatch.lock_reason ?? 'admin_manual_deadcoin';
      lockPatch.lock_at = new Date().toISOString();
    } else {
      // Admin is moving OUT of deadcoin → clear lock only when force=1 OR it was admin-created
      // (Community-locked is already blocked above unless force=1)
      if (prevStatus === 'deadcoin') {
        lockPatch.lock_deadcoin = false;
        lockPatch.lock_reason = null;
      }
    }

    if (status === 'blacklist' || status === 'redlist') {
      lockPatch.source = 'admin';
      lockPatch.lock_list = true;
      lockPatch.lock_list_at = new Date().toISOString();
    }

    const mergedMeta = {
      ...baseMeta,
      ...lockPatch,

      // ✅ Always stamp admin source for PUT (prevents spoofing)
      source: 'admin',

      // keep force info
      force: !!force,
    };

    const after = await upsertTokenStatus({
      mint,
      newStatus: status as TokenStatus,
      changedBy: actor,
      reason,
      meta: mergedMeta,
    });

    try {
      cache.del(statusKey(mint));
    } catch {}

    return NextResponse.json({
      success: true,
      mint,
      previous: prevStatus,
      status: after.status,
      statusAt: after.statusAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
