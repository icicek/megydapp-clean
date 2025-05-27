export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  console.log('✅ /api/coincarnation/record API called');

  try {
    const body = await req.json();
    const {
      wallet_address,
      token_symbol,
      token_contract,
      token_amount,
      usd_value,
      transaction_signature,
      network,
      user_agent,
    } = body;

    const timestamp = new Date().toISOString();
    console.log('📦 Body:', body);

    await sql`
      INSERT INTO participants (wallet_address)
      VALUES (${wallet_address})
      ON CONFLICT (wallet_address) DO NOTHING;
    `;

    await sql`
      INSERT INTO contributions (
        wallet_address,
        token_symbol,
        token_contract,
        network,
        token_amount,
        usd_value,
        transaction_signature,
        user_agent,
        timestamp
      ) VALUES (
        ${wallet_address},
        ${token_symbol},
        ${token_contract},
        ${network},
        ${token_amount},
        ${usd_value},
        ${transaction_signature},
        ${user_agent},
        ${timestamp}
      );
    `;

    const result = await sql`
      SELECT id FROM participants WHERE wallet_address = ${wallet_address}
    `;

    const number = result[0]?.id ?? 0;
    console.log('🎯 Participant ID:', number);

    return NextResponse.json({
      success: true,
      number,
      message: '✅ Coincarnation recorded successfully',
    });
  } catch (error: any) {
    console.error('❌ Record API Error:', error?.message || error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Unknown server error',
      },
      { status: 500 }
    );
  }
}
