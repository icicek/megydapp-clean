// app/api/corepoints/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    // Hem ?wallet= hem de ?wallet_address= parametrelerini destekle
    const wallet =
      url.searchParams.get('wallet') ||
      url.searchParams.get('wallet_address') ||
      '';

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 }
      );
    }

    // corepoint_events şeman:
    // id, wallet_address, type, points, value, tx_id, token_contract,
    // ref_wallet, context, day, created_at
    const rows = await sql/*sql*/`
      SELECT
        id,
        wallet_address,
        type,
        points,
        value,
        tx_id,
        token_contract,
        ref_wallet,
        context,
        day,
        created_at
      FROM corepoint_events
      WHERE wallet_address = ${wallet}
      ORDER BY created_at DESC
      LIMIT 200
    ` as unknown as {
      id: number;
      wallet_address: string;
      type: string;
      points: number | null;
      value: number | null;
      tx_id: string | null;
      token_contract: string | null;
      ref_wallet: string | null;
      context: string | null;
      day: string | null;
      created_at: string;
    }[];

    return NextResponse.json({
      success: true,
      wallet,
      events: rows,
    });
  } catch (e: any) {
    console.error('❌ /api/corepoints/history failed:', e?.message || e);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
