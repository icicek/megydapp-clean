// app/api/admin/auth/nonce/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { randomUUID } from 'node:crypto';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { isAdminAllowed } from '@/app/api/_lib/admins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = (searchParams.get('wallet') || '').trim();

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
    }
    // Basit base58/solana pubkey kontrolü (hızlı ön eleme)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(wallet)) {
      return NextResponse.json({ success: false, error: 'invalid wallet' }, { status: 400 });
    }

    if (!(await isAdminAllowed(wallet))) {
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
    }, {
      headers: { 'Cache-Control': 'no-store' }, // tarayıcı cache’ine düşmesin
    });
  } catch (err: any) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}

// Preflight için sessiz dönüş (tarayıcı gönlü olsun)
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// Diğer methodlar 405
export function POST() {
  return NextResponse.json({ success: false, error: 'Method Not Allowed' }, { status: 405 });
}
