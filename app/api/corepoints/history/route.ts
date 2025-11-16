// app/api/corepoints/history/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = (searchParams.get('wallet') || '').trim();

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Missing wallet param' }, { status: 400 });
    }

    const rows = await sql/* sql */`
      SELECT
        type,
        points,
        value,
        token_contract,
        tx_id,
        ref_wallet,
        context,
        channel,
        day,
        created_at
      FROM corepoint_events
      WHERE wallet_address = ${wallet}
      ORDER BY created_at DESC
      LIMIT 200;
    `;

    return NextResponse.json({
      success: true,
      count: rows.length,
      events: rows.map((r: any) => ({
        type: r.type,
        points: Number(r.points),
        value: r.value ?? null,
        token: r.token_contract ?? null,
        tx: r.tx_id ?? null,
        ref: r.ref_wallet ?? null,
        context: r.context ?? null,
        channel: r.channel ?? null,
        date: r.day ?? r.created_at,
      })),
    });
  } catch (error) {
    console.error('❌ CorePoint history error:', error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
