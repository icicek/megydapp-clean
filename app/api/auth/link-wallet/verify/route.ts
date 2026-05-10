//app/api/auth/link-wallet/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { sql } from '@/app/api/_lib/db';
import { USER_AUTH_COOKIE, verifyUserSession } from '@/app/api/_lib/user-auth';
import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';

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
    const nonce = String(body.nonce || '').trim();
    const signatureBase64 = String(body.signature || '').trim();

    let publicKey: PublicKey;

    try {
      publicKey = new PublicKey(walletAddress);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid wallet address.' },
        { status: 400 }
      );
    }

    if (!nonce || !signatureBase64) {
      return NextResponse.json(
        { ok: false, error: 'Missing nonce or signature.' },
        { status: 400 }
      );
    }

    if (walletAddress === session.walletAddress) {
      return NextResponse.json(
        { ok: false, error: 'This wallet is already your active wallet.' },
        { status: 400 }
      );
    }

    const nonceRows = await sql`
      SELECT id
      FROM user_nonces
      WHERE LOWER(wallet_address) = LOWER(${walletAddress})
        AND nonce = ${nonce}
        AND purpose = 'link_wallet'
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (nonceRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nonce expired or already used.' },
        { status: 401 }
      );
    }

    const expectedMessage = buildLinkWalletMessage(walletAddress, nonce);
    const messageBytes = new TextEncoder().encode(expectedMessage);
    const signatureBytes = Buffer.from(signatureBase64, 'base64');

    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );

    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Invalid wallet signature.' },
        { status: 401 }
      );
    }

    const existingWalletRows = await sql`
      SELECT identity_id
      FROM identity_wallets
      WHERE LOWER(wallet_address) = LOWER(${walletAddress})
        AND chain = 'solana'
      LIMIT 1
    `;

    if (existingWalletRows.length > 0) {
      return NextResponse.json(
        { ok: false, error: 'This wallet is already linked to an identity.' },
        { status: 400 }
      );
    }

    await sql`
      UPDATE user_nonces
      SET used_at = NOW()
      WHERE id = ${nonceRows[0].id}
    `;

    await sql`
      INSERT INTO identity_wallets (
        identity_id,
        wallet_address,
        chain,
        is_primary,
        verified_at,
        last_seen_at
      )
      VALUES (
        ${session.identityId},
        ${walletAddress},
        'solana',
        false,
        NOW(),
        NOW()
      )
    `;

    await sql`
      INSERT INTO identity_risk_events (
        identity_id,
        wallet_address,
        event_type,
        severity,
        score_delta,
        details
      )
      VALUES (
        ${session.identityId},
        ${walletAddress},
        'wallet_linked',
        'info',
        0,
        ${JSON.stringify({
          chain: 'solana',
          activeWalletAddress: session.walletAddress,
        })}::jsonb
      )
    `;
    try {
        await recalculateIdentityScores(session.identityId);
      } catch (e) {
        console.error('[identity-score] recalculate failed:', e);
      }

    return NextResponse.json({
      ok: true,
      identityId: session.identityId,
      walletAddress,
      linked: true,
    });
  } catch (error) {
    console.error('[auth/link-wallet/verify] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to link wallet.' },
      { status: 500 }
    );
  }
}