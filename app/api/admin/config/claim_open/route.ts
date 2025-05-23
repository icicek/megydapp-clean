// ✅ File: app/api/admin/config/claim_open/route.ts

import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);
const ADMIN_WALLET = process.env.ADMIN_WALLET?.toLowerCase();

export async function GET() {
  try {
    const { rows }: { rows: { value: string }[] } = await sql`
      SELECT value FROM config WHERE key = 'claim_open' LIMIT 1;
    `;
    const value = rows[0]?.value ?? 'false';
    return NextResponse.json({ success: true, value });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Config read error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { wallet, value } = await req.json();

    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    await sql`
      INSERT INTO config (key, value)
      VALUES ('claim_open', ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Config update error' }, { status: 500 });
  }
}
