// ✅ File: app/api/claim/route.ts

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  try {
    const { wallet } = await req.json();

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Missing wallet' }, { status: 400 });
    }

    // Check existing claim status
    const result = await sql`
      SELECT claimed FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;
    const rows = result as { claimed: boolean }[];

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 });
    }

    const claimed = rows[0].claimed;

    return NextResponse.json({ success: true, claimed });
  } catch (err) {
    console.error('Error in claim route:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
