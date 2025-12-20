// app/api/lv/apply/route.ts
// LEGACY: now proxies to token_registry (single source of truth)

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { setStatus as setRegistryStatus } from '@/app/api/_lib/token-registry';
import type { TokenStatus } from '@/app/api/_lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, category } = body || {};

    if (!mint || !category) {
      return NextResponse.json(
        { success: false, error: 'mint and category are required' },
        { status: 400 }
      );
    }

    if (!['healthy', 'walking_dead', 'deadcoin'].includes(category)) {
      return NextResponse.json(
        { success: false, error: 'invalid category' },
        { status: 400 }
      );
    }

    // IMPORTANT:
    // legacy LV flow used to do "deadcoin -> walking_dead awaiting_votes"
    // but your NEW system can directly set deadcoin when decided.
    const newStatus = category as TokenStatus;

    const res = await setRegistryStatus({
      mint,
      newStatus,
      changedBy: 'legacy:lv_apply',
      reason: 'legacy_lv_apply',
      meta: { source: 'legacy' },
    });

    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
