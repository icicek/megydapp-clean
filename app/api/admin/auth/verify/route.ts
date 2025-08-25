// app/api/admin/auth/verify/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { signAdmin } from '@/app/api/_lib/jwt';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fail-closed allowlist: ENV boşsa reddet
function isAllowed(wallet: string): boolean {
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(wallet);
}

export async function POST(req: Request) {
  try {
    const { wallet, signature } = (await req.json()) || {};
    if (!wallet || !signature) {
      return NextResponse.json(
        { success: false, error: 'wallet and signature required' },
        { status: 400 }
      );
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
    const sigBytes = bs58.decode(signature);
    const pubkeyBytes = bs58.decode(wallet);

    const ok = nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'invalid signature' }, { status: 401 });
    }

    // 3) Allowlist kontrolü (fail-closed)
    if (!isAllowed(wallet)) {
      return NextResponse.json({ success: false, error: 'Not allowed' }, { status: 403 });
    }

    // 4) JWT üret
    const token = signAdmin(wallet, 60 * 60); // 1 saat

    // 5) Nonce'u tek-kullanımlık yap (sil)
    await sql`DELETE FROM admin_nonces WHERE wallet = ${wallet}`;

    // 6) JSON + HttpOnly Cookie
    const res = NextResponse.json({ success: true, token, wallet, expiresIn: 3600 });
    res.cookies.set('coincarnation_admin', token, {
      httpOnly: true,
      secure: true,     // prod https
      sameSite: 'strict',
      maxAge: 60 * 60,
      path: '/',
    });
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'verify error' },
      { status: 500 }
    );
  }
}
