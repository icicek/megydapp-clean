//app/api/auth/nonce/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { sql } from '@/app/api/_lib/db';
import { buildUserAuthMessage, createUserNonce } from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const walletAddress = String(body.walletAddress || '').trim();

    try {
      new PublicKey(walletAddress);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid wallet address.' },
        { status: 400 }
      );
    }

    const nonce = createUserNonce();
    const message = buildUserAuthMessage(walletAddress, nonce);

    await sql`
      INSERT INTO user_nonces (
        wallet_address,
        nonce,
        purpose,
        expires_at
      )
      VALUES (
        ${walletAddress},
        ${nonce},
        'user_auth',
        NOW() + INTERVAL '10 minutes'
      )
    `;

    return NextResponse.json({
      ok: true,
      walletAddress,
      nonce,
      message,
    });
  } catch (error) {
    console.error('[auth/nonce] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to create auth nonce.' },
      { status: 500 }
    );
  }
}