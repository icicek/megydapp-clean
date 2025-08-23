import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { signAdmin } from '@/app/api/_lib/jwt';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export const dynamic = 'force-dynamic';

function isAllowed(wallet: string): boolean {
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(wallet);
}

export async function POST(req: Request) {
  try {
    const { wallet, signature } = (await req.json()) as {
      wallet: string;           // base58 public key
      signature: string;        // base58 ed25519 signature of message
    };

    if (!wallet || !signature) {
      return NextResponse.json({ success: false, error: 'wallet & signature required' }, { status: 400 });
    }
    if (!isAllowed(wallet)) {
      return NextResponse.json({ success: false, error: 'wallet not allowed' }, { status: 403 });
    }

    // Nonce'ı al
    const rows = (await sql`
      SELECT nonce, expires_at FROM admin_nonces WHERE wallet = ${wallet}
    `) as unknown as { nonce: string; expires_at: string }[];

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'no nonce for wallet' }, { status: 400 });
    }

    const { nonce, expires_at } = rows[0];
    if (new Date(expires_at).getTime() < Date.now()) {
      return NextResponse.json({ success: false, error: 'nonce expired' }, { status: 400 });
    }

    // İmzalanan mesaj
    const message = new TextEncoder().encode(`Coincarnation Admin Login\nnonce=${nonce}`);

    // Doğrulama
    const pubkey = bs58.decode(wallet);              // 32 byte
    const sig = bs58.decode(signature);              // 64 byte
    const ok = nacl.sign.detached.verify(message, sig, pubkey);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'invalid signature' }, { status: 401 });
    }

    // Tek kullanımlık nonce -> sil
    await sql`DELETE FROM admin_nonces WHERE wallet = ${wallet}`;

    // JWT üret
    const token = signAdmin(wallet, 60 * 60); // 1 saat

    return NextResponse.json({ success: true, token, wallet, expiresIn: 3600 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
