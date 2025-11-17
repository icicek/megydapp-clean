// app/api/corepoints/history/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json(
      { success: false, error: 'wallet param is required', events: [] },
      { status: 400 }
    );
  }

  try {
    const rows = await sql/* sql */`
      SELECT
        wallet_address,
        type,
        points,
        value,
        token_contract,
        channel,
        context,
        ref_wallet,
        tx_id,
        day,
        created_at
      FROM corepoint_events
      WHERE wallet_address = ${wallet}
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 200
    `;

    const events = rows.map((r: any) => ({
      wallet: r.wallet_address,
      type: r.type,
      points: Number(r.points ?? 0),
      value: r.value,
      token_contract: r.token_contract,
      channel: r.channel,
      context: r.context,
      ref_wallet: r.ref_wallet,
      tx_id: r.tx_id,
      day: r.day,
      date: r.created_at || r.day || null,
    }));

    return NextResponse.json({ success: true, events });
  } catch (e: any) {
    console.error('❌ /api/corepoints/history failed:', e?.message || e);
    return NextResponse.json(
      { success: false, error: 'Internal server error', events: [] },
      { status: 500 }
    );
  }
}
