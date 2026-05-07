//app/api/auth/link-wallet/nonce/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { cookies } from 'next/headers';
import { sql } from '@/app/api/_lib/db';
import {
  USER_AUTH_COOKIE,
  verifyUserSession,
  createUserNonce,
} from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

function buildLinkWalletMessage(walletAddress: string, nonce: string) {
  return [
    'Coincarnation Identity Wallet Linking',
    '',
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    '',
    'Sign this message to link this wallet to your existing Coincarnation Identity.',
    'This does not approve a transaction or move funds.',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(USER_AUTH_COOKIE)?.value;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Identity session required.' },
        { status: 401 }
      );
    }

    const session = verifyUserSession(token);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Invalid identity session.' },
        { status: 401 }
      );
    }

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

    if (walletAddress === session.walletAddress) {
      return NextResponse.json(
        { ok: false, error: 'This wallet is already your active wallet.' },
        { status: 400 }
      );
    }

    const existing = await sql`
      SELECT id
      FROM identity_wallets
      WHERE wallet_address = ${walletAddress}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { ok: false, error: 'This wallet is already linked to an identity.' },
        { status: 400 }
      );
    }

    const nonce = createUserNonce();
    const message = buildLinkWalletMessage(walletAddress, nonce);

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
        'link_wallet',
        NOW() + INTERVAL '10 minutes'
      )
    `;

    return NextResponse.json({
      ok: true,
      walletAddress,
      nonce,
      message,
      identityId: session.identityId,
    });
  } catch (error) {
    console.error('[auth/link-wallet/nonce] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to create wallet link nonce.' },
      { status: 500 }
    );
  }
}