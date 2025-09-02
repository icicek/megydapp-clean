// app/api/admin/auth/verify/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { signAdmin } from '@/app/api/_lib/jwt';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { isAdminAllowed } from '@/app/api/_lib/admins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { wallet, signature } = (await req.json()) || {};
    if (!wallet || !signature) {
      return NextResponse.json(
        { success: false, error: 'wallet and signature required' },
        { status: 400 }
      );
    }

    // Basit format kontrolü (hızlı eleme)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(String(wallet))) {
      return NextResponse.json({ success: false, error: 'invalid wallet' }, { status: 400 });
    }

    // 1) Nonce'ı al
    const rows = (await sql`
      SELECT nonce, expires_at
      FROM admin_nonces
      WHERE wallet = ${wallet}
    `) as unknown as { nonce: string; expires_at: string }[];

    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'nonce not found' }, { status: 401 });
    }

    const { nonce, expires_at } = rows[0];
    const exp = new Date(expires_at).getTime();
    if (isNaN(exp) || Date.now() > exp) {
      return NextResponse.json({ success: false, error: 'nonce expired' }, { status: 401 });
    }

    // 2) İmzayı doğrula (Ed25519)
    const message = `Coincarnation Admin Login\nnonce=${nonce}`;
    const msgBytes = new TextEncoder().encode(message);

    let sigBytes: Uint8Array, pubkeyBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(String(signature));
      pubkeyBytes = bs58.decode(String(wallet));
    } catch {
      return NextResponse.json({ success: false, error: 'invalid base58' }, { status: 400 });
    }

    const ok = nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'invalid signature' }, { status: 401 });
    }

    // 3) Allowlist kontrolü (ENV ∪ DB; fail-closed)
    if (!(await isAdminAllowed(wallet))) {
      return NextResponse.json({ success: false, error: 'Not allowed' }, { status: 403 });
    }

    // 4) JWT üret
    const token = signAdmin(wallet, 60 * 60); // 1 saat

    // 5) Nonce'u tek-kullanımlık yap (sil)
    await sql`DELETE FROM admin_nonces WHERE wallet = ${wallet}`;

    // 6) JSON + HttpOnly Cookie + cache kapalı
    const res = NextResponse.json(
      { success: true, token, wallet, expiresIn: 3600 },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    res.cookies.set('coincarnation_admin', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60,
      path: '/',
    });
    return res;
  } catch (err: any) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}

// Preflight için sessiz dönüş
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// Diğer methodlar 405
export function GET() {
  return NextResponse.json({ success: false, error: 'Method Not Allowed' }, { status: 405 });
}
