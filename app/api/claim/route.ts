// ✅ File: app/api/claim/route.ts

import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { wallet } = body;

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Wallet is required' }, { status: 400 });
    }

    // Check existing claim status
    const { rows }: { rows: { claimed: boolean }[] } = await sql`
      SELECT claimed FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 });
    }

    if (rows[0].claimed) {
      return NextResponse.json({ success: false, error: 'Already claimed' }, { status: 409 });
    }

    // Update the participant as claimed
    await sql`
      UPDATE participants SET claimed = true WHERE wallet_address = ${wallet};
    `;

    // (Optional) Here you would trigger a MEGY token transfer from your treasury wallet

    return NextResponse.json({ success: true, message: 'Claim successful' });
  } catch (err) {
    console.error('Claim error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
