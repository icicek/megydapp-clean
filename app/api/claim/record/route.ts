import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      wallet_address,
      claim_amount,
      destination,
      tx_signature,
      sol_fee_paid,
    } = body;

    const timestamp = new Date().toISOString();

    await sql`
      INSERT INTO claims (
        wallet_address,
        claim_amount,
        destination,
        tx_signature,
        sol_fee_paid,
        timestamp
      )
      VALUES (
        ${wallet_address},
        ${claim_amount},
        ${destination},
        ${tx_signature},
        ${sol_fee_paid},
        ${timestamp}
      )
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Claim kayıt hatası:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
