// app/api/admin/auth/nonce/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';       // Edge yerine Node.js
export const dynamic = 'force-dynamic';

function isAllowed(wallet: string): boolean {
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(wallet);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = (searchParams.get('wallet') || '').trim();

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
    }
    if (!isAllowed(wallet)) {
      return NextResponse.json({ success: false, error: 'wallet not allowed' }, { status: 403 });
    }

    const nonce = randomUUID();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 dk

    await sql`
      INSERT INTO admin_nonces (wallet, nonce, expires_at)
      VALUES (${wallet}, ${nonce}, ${expires.toISOString()})
      ON CONFLICT (wallet)
      DO UPDATE SET nonce = EXCLUDED.nonce, expires_at = EXCLUDED.expires_at, created_at = NOW()
    `;

    const message = `Coincarnation Admin Login\nnonce=${nonce}`;

    return NextResponse.json({
      success: true,
      wallet,
      nonce,
      message,
      expiresAt: expires.toISOString(),
    });
  } catch (err: any) {
    // Hata mesajını görünür yapalım
    return NextResponse.json(
      { success: false, error: err?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
