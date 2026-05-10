//app/api/auth/link-code/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { sql } from '@/app/api/_lib/db';
import {
  getUserCookieOptions,
  signUserSession,
  USER_AUTH_COOKIE,
} from '@/app/api/_lib/user-auth';
import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';

export const dynamic = 'force-dynamic';

function buildLinkCodeMessage(walletAddress: string, code: string) {
  return [
    'Coincarnation Identity Recovery',
    '',
    `Wallet: ${walletAddress}`,
    `Link Code: ${code}`,
    '',
    'Sign this message to link this wallet to an existing Coincarnation Identity.',
    'This does not approve a transaction or move funds.',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const walletAddress = String(body.walletAddress || '').trim();
    const code = String(body.code || '').trim().toUpperCase();
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

    if (!code || !signatureBase64) {
      return NextResponse.json(
        { ok: false, error: 'Missing link code or signature.' },
        { status: 400 }
      );
    }

    const codeRows = await sql`
      SELECT id, identity_id
      FROM identity_link_codes
      WHERE code = ${code}
        AND purpose = 'link_wallet'
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `;

    if (codeRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Link code expired or already used.' },
        { status: 401 }
      );
    }

    const identityId = codeRows[0].identity_id;

    const identityRows = await sql`
      SELECT id, status
      FROM identities
      WHERE id = ${identityId}
      LIMIT 1
    `;

    if (identityRows.length === 0 || identityRows[0].status !== 'active') {
      return NextResponse.json(
        { ok: false, error: 'Active identity not found.' },
        { status: 404 }
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

    const expectedMessage = buildLinkCodeMessage(walletAddress, code);
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

    await sql`
      UPDATE identity_link_codes
      SET used_at = NOW()
      WHERE id = ${codeRows[0].id}
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
        ${identityId},
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
        ${identityId},
        ${walletAddress},
        'wallet_linked_by_recovery_code',
        'info',
        0,
        ${JSON.stringify({ chain: 'solana', code })}::jsonb
      )
    `;

    try {
      await recalculateIdentityScores(identityId);
    } catch (e) {
      console.error('[identity-score] recalculate failed:', e);
    }

    const token = signUserSession({
      identityId,
      walletAddress,
    });

    const res = NextResponse.json({
      ok: true,
      identityId,
      walletAddress,
      linked: true,
    });

    res.cookies.set(USER_AUTH_COOKIE, token, getUserCookieOptions());

    return res;
  } catch (error) {
    console.error('[auth/link-code/verify] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to verify identity link code.' },
      { status: 500 }
    );
  }
}