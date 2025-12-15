// app/api/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cache, statusKey, STATUS_TTL } from '@/app/api/_lib/cache';
import type { TokenStatus } from '@/app/api/_lib/types';
import { verifyCsrf } from '@/app/api/_lib/csrf';

// Effective status hesapları
import { getEffectiveStatus, getStatusRow } from '@/app/api/_lib/registry';

// Manuel upsert için compat
import {
  getStatus as getTokenStatus,
  setStatus as upsertTokenStatus,
} from '@/app/api/_lib/token-registry';

// votes
import { sql } from '@/app/api/_lib/db';
import { getVoteThreshold } from '@/app/api/_lib/settings';

// ✅ NEW: thresholds + optional metrics
import { getTokenThresholds } from '@/app/api/_lib/token-thresholds';
import { checkTokenLiquidityAndVolume } from '@/app/api/utils/checkTokenLiquidityAndVolume';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const includeMetrics =
      req.nextUrl.searchParams.get('includeMetrics') === '1';

    // --- 1) Status + statusAt (cache destekli) ---
    const key = statusKey(mint);

    let status: TokenStatus;
    let statusAt: string | null;

    const cached = cache.get<{ status: TokenStatus; statusAt: string | null }>(key);
    if (cached) {
      status = cached.status;
      statusAt = cached.statusAt;
    } else {
      const eff = (await getEffectiveStatus(mint)) as TokenStatus;

      const row: any = await getStatusRow(mint);
      const at = row?.status_at ?? row?.updated_at ?? row?.created_at ?? null;

      status = eff;
      statusAt = at;

      cache.set(key, { status, statusAt });
    }

    // --- 2) Community votes (cache'siz, canlı) ---
    const yesRows = (await sql`
      SELECT COUNT(*)::int AS c
      FROM deadcoin_votes
      WHERE mint = ${mint} AND vote_yes = TRUE
    `) as unknown as { c: number }[];

    const votesYes = yesRows[0]?.c ?? 0;

    // Dinamik vote threshold
    const threshold = await getVoteThreshold();

    // --- 3) Token thresholds (DB) ---
    // admin panel değişince /api/admin/config invalidate ediyor; burada ayrıca TTL var
    const thresholds = await getTokenThresholds();

    // --- 4) Optional metrics snapshot (liq/vol) ---
    let metrics: any = null;
    if (includeMetrics) {
      try {
        const m = await checkTokenLiquidityAndVolume({ mint });
        metrics = {
          category: m.category,
          reason: (m as any).reason ?? null,
          liquidity: m.liquidity,
          volume: m.volume,
          dexVolume: m.dexVolume,
          cexVolume: m.cexVolume,
          sources: m.sources,
        };
      } catch (e: any) {
        metrics = { error: e?.message || 'metrics_failed' };
      }
    }

    return NextResponse.json(
      {
        success: true,
        mint,
        status,
        statusAt,
        votesYes,
        threshold,
        thresholds, // ✅ new
        metrics,    // ✅ new (optional)
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
 * PUT /api/status (unchanged, only keep)
 */
export async function PUT(req: NextRequest) {
  try {
    verifyCsrf(req);

    const body = await req.json();
    const {
      mint,
      status,
      reason = null,
      source = 'manual',
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

    const prev = await getTokenStatus(mint);
    const actor = (changedBy as string) || (source as string) || 'manual';

    const mergedMeta = {
      ...((typeof meta === 'object' && meta) || {}),
      source,
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
      previous: prev.status,
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
