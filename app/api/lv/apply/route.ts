// LEGACY: Thin wrapper around applyLvCategory (token_status-based).
// The live Coincarnation flow uses `token_registry` and `/api/vote` instead.
// Consider removing this endpoint if no external LV client calls it.

// app/api/lv/apply/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { applyLvCategory } from '@/app/api/list/repo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, category } = body || {};
    if (!mint || !category) {
      return NextResponse.json({ success: false, error: 'mint and category are required' }, { status: 400 });
    }
    if (!['healthy','walking_dead','deadcoin'].includes(category)) {
      return NextResponse.json({ success: false, error: 'invalid category' }, { status: 400 });
    }
    const res = await applyLvCategory(mint, category);
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
