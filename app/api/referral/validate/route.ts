//app/api/referral/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { PublicKey } from '@solana/web3.js';
import { getDatabaseUrl } from '@/app/api/_lib/database-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sql = neon(getDatabaseUrl());

const PUBLIC_COINCARNATION_IS_TEST =
  String(process.env.COINCARNATION_PUBLIC_MODE ?? 'test')
    .trim()
    .toLowerCase() !== 'production';

function parseReferral(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const input = value.trim();
  if (!input || input.length > 512) return null;

  let code = input;

  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      const hostname = url.hostname.toLowerCase();

      if (
        hostname !== 'coincarnation.com' &&
        hostname !== 'www.coincarnation.com'
      ) {
        return null;
      }

      code = url.searchParams.get('r')?.trim() || '';
    } catch {
      return null;
    }
  }

  return /^[a-zA-Z0-9_-]{1,64}$/.test(code) ? code : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const rawCode = body?.code;
    const code = parseReferral(rawCode);
    const wallet = String(body?.wallet_address || '').trim();

    if (!code) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid referral code or link.'
      });
    }

    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json(
        { valid: false, error: 'Connect a valid Solana wallet.' },
        { status: 400 }
      );
    }

    const walletRows = await sql`
      SELECT identity_id
      FROM identity_wallets
      WHERE chain = 'solana'
        AND LOWER(wallet_address) = LOWER(${wallet})
      LIMIT 1
    `;

    const ownIdentity = walletRows[0]?.identity_id
      ? String(walletRows[0].identity_id)
      : null;

    // Referral is available only before the first production
    // Coincarnation and before joining an existing Identity.
    if (ownIdentity) {
      return NextResponse.json({
        valid: false,
        error: 'Referral codes are available only to new users.',
      });
    }

    const previousContributionRows = await sql`
      SELECT id
      FROM contributions
      WHERE LOWER(wallet_address) = LOWER(${wallet})
        AND network = 'solana'
        AND is_test = ${PUBLIC_COINCARNATION_IS_TEST}
      LIMIT 1
    `;

    if (previousContributionRows.length > 0) {
      return NextResponse.json({
        valid: false,
        error: 'Referral codes can only be used before your first Coincarnation.',
      });
    }

    const existing = await sql`
      SELECT referrer_wallet
      FROM participants
      WHERE LOWER(wallet_address) = LOWER(${wallet})
        AND network = 'solana'
      LIMIT 1
    `;

    const identityMatches = await sql`
      SELECT irc.identity_id, iw.wallet_address
      FROM identity_referral_codes irc
      JOIN identity_wallets iw
        ON iw.identity_id = irc.identity_id
       AND iw.is_primary = true
       AND iw.chain = 'solana'
      WHERE LOWER(irc.referral_code) = LOWER(${code})
      LIMIT 1
    `;

    let referrerWallet: string | null = null;
    let referrerIdentity: string | null = null;

    if (identityMatches.length) {
      referrerWallet = String(identityMatches[0].wallet_address);
      referrerIdentity = String(identityMatches[0].identity_id);
    } else {
      const legacyMatches = await sql`
        SELECT wallet_address
        FROM participants
        WHERE LOWER(referral_code) = LOWER(${code})
        LIMIT 1
      `;

      if (legacyMatches.length) {
        referrerWallet = String(legacyMatches[0].wallet_address);

        const legacyIdentity = await sql`
          SELECT identity_id
          FROM identity_wallets
          WHERE chain = 'solana'
            AND LOWER(wallet_address) = LOWER(${referrerWallet})
          LIMIT 1
        `;

        referrerIdentity = legacyIdentity[0]?.identity_id
          ? String(legacyIdentity[0].identity_id)
          : null;
      }
    }

    if (!referrerWallet) {
      return NextResponse.json({
        valid: false,
        error: 'Referral code not found.'
      });
    }

    if (
      referrerWallet.toLowerCase() === wallet.toLowerCase() ||
      (ownIdentity && referrerIdentity === ownIdentity)
    ) {
      return NextResponse.json({
        valid: false,
        error: 'You cannot use your own Identity referral code.'
      });
    }

    if (existing.length) {
      const previousReferrer = existing[0].referrer_wallet
        ? String(existing[0].referrer_wallet)
        : null;

      if (
        !previousReferrer ||
        previousReferrer.toLowerCase() !== referrerWallet.toLowerCase()
      ) {
        return NextResponse.json({
          valid: false,
          error: 'Your existing referral relationship cannot be changed.'
        });
      }
    }

    return NextResponse.json({
      valid: true,
      code,
      eligibleForNewIdentityReward: !ownIdentity,
      message: ownIdentity
        ? 'Valid referral code. Existing identities do not receive a new identity signup reward.'
        : 'Referral code verified. Any signup reward remains subject to new Identity eligibility.'
    });
  } catch (error) {
    console.error('[referral/validate] error:', error);

    return NextResponse.json(
      {
        valid: false,
        error: 'Referral verification is temporarily unavailable.'
      },
      { status: 503 }
    );
  }
}
