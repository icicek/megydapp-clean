// app/api/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cache, statusKey, STATUS_TTL } from '@/app/api/_lib/cache';
import type { TokenStatus } from '@/app/api/_lib/types';
import { verifyCsrf } from '@/app/api/_lib/csrf';

// Effective status hesapları (override + eşikler)
import { getEffectiveStatus, getStatusRow } from '@/app/api/_lib/registry';

// Manuel upsert için mevcut helper'lar (compat)
import {
  getStatus as getTokenStatus,
  setStatus as upsertTokenStatus,
} from '@/app/api/_lib/token-registry';

// 🔹 YENİ: vote sayısı ve threshold için
import { sql } from '@/app/api/_lib/db';
import { getVoteThreshold } from '@/app/api/_lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/status?mint=...
 * - Effective status döner (red/black override + eşikler).
 * - statusAt için registry satırından en uygun alan seçilir.
 * - Node-cache ile kısa süreli cache (STATUS_TTL) uygular.
 * - Ek olarak community oy sayısı ve threshold döner.
 * Yanıt: { success: true, mint, status, statusAt, votesYes, threshold }
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

    // --- 1) Status + statusAt (cache destekli) ---
    const key = statusKey(mint);

    let status: TokenStatus;
    let statusAt: string | null;

    const cached = cache.get<{ status: TokenStatus; statusAt: string | null }>(
      key,
    );
    if (cached) {
      status = cached.status;
      statusAt = cached.statusAt;
    } else {
      const eff = (await getEffectiveStatus(mint)) as TokenStatus;

      const row: any = await getStatusRow(mint);
      const at =
        row?.status_at ?? row?.updated_at ?? row?.created_at ?? null;

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

    // Dinamik threshold (admin panelden değişebilir)
    const threshold = await getVoteThreshold();

    // --- 3) Yanıt ---
    return NextResponse.json(
      {
        success: true,
        mint,
        status,
        statusAt,
        votesYes,
        threshold,
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
 * Body: { mint, status, reason?, source?="manual", force?=false, meta?={}, changedBy? }
 * - Eski sözleşmeyle uyumlu (reason/source/force/meta desteklenir).
 * - upsert sonrası token-registry.setStatus cache invalidation yapıyorsa ek iş yok;
 *   yine de emniyet için local cache'i siliyoruz.
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
      changedBy, // optional
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

    // Önceki durum (compat)
    const prev = await getTokenStatus(mint);

    // Actor
    const actor = (changedBy as string) || (source as string) || 'manual';

    // Meta birleştir
    const mergedMeta = {
      ...((typeof meta === 'object' && meta) || {}),
      source,
      force: !!force,
    };

    // Upsert + audit + (genelde) cache invalidation inside
    const after = await upsertTokenStatus({
      mint,
      newStatus: status as TokenStatus,
      changedBy: actor,
      reason,
      meta: mergedMeta,
    });

    // Emniyet: local cache'i de temizle
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
