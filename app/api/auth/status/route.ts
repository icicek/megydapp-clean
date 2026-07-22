// app/api/auth/status/route.ts

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { sql } from '@/app/api/_lib/db';
import {
  USER_AUTH_COOKIE,
  verifyUserSession,
} from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function normalizeWalletAddress(
  value: unknown
): string | null {
  const rawWalletAddress = String(value ?? '').trim();

  if (!rawWalletAddress) {
    return null;
  }

  try {
    return new PublicKey(rawWalletAddress).toBase58();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get(USER_AUTH_COOKIE)?.value;

    if (!token) {
      return jsonResponse({
        ok: true,
        authenticated: false,
        identity: null,
      });
    }

    const session = verifyUserSession(token);

    if (!session) {
      return jsonResponse({
        ok: true,
        authenticated: false,
        identity: null,
      });
    }

    const sessionWalletAddress =
      normalizeWalletAddress(session.walletAddress);

    if (!sessionWalletAddress) {
      console.error(
        '[auth/status] invalid wallet address in session:',
        session.walletAddress
      );

      return jsonResponse({
        ok: true,
        authenticated: false,
        identity: null,
      });
    }

    const identityRows = await sql`
      SELECT
        i.id,
        i.primary_wallet_address,
        i.human_confidence_score,
        i.risk_score,
        i.status,

        EXISTS (
          SELECT 1
          FROM identity_wallets iw
          WHERE iw.identity_id = i.id
            AND iw.wallet_address = ${sessionWalletAddress}
            AND iw.chain = 'solana'
            AND iw.verified_at IS NOT NULL
        ) AS wallet_verified,

        EXISTS (
          SELECT 1
          FROM identity_fingerprints identity_fingerprint
          WHERE identity_fingerprint.identity_id = i.id
        ) AS fingerprint_recorded,

        EXISTS (
          SELECT 1
          FROM identity_socials identity_social
          WHERE identity_social.identity_id = i.id
            AND identity_social.provider = 'x'
            AND identity_social.verified_at IS NOT NULL
        ) AS x_linked,

        (
          SELECT COUNT(*)::int
          FROM identity_wallets linked_wallet
          WHERE linked_wallet.identity_id = i.id
            AND linked_wallet.chain = 'solana'
            AND linked_wallet.verified_at IS NOT NULL
        ) AS linked_wallet_count

      FROM identities i
      WHERE i.id = ${session.identityId}
      LIMIT 1
    `;

    if (identityRows.length === 0) {
      return jsonResponse({
        ok: true,
        authenticated: false,
        identity: null,
      });
    }

    const identity = identityRows[0];

    const primaryWalletAddress =
      identity.primary_wallet_address === null
        ? null
        : normalizeWalletAddress(
            identity.primary_wallet_address
          );

    if (
      identity.primary_wallet_address !== null &&
      !primaryWalletAddress
    ) {
      console.error(
        '[auth/status] invalid primary wallet address for identity:',
        session.identityId
      );

      return jsonResponse(
        {
          ok: false,
          error: 'Failed to read identity status.',
        },
        500
      );
    }

    const walletVerified =
      identity.wallet_verified === true;

    const fingerprintRecorded =
      identity.fingerprint_recorded === true;

    const xLinked =
      identity.x_linked === true;

    const linkedWalletCount = Number(
      identity.linked_wallet_count ?? 0
    );

    const riskScore = Number(
      identity.risk_score ?? 0
    );

    const humanConfidenceScore = Number(
      identity.human_confidence_score ?? 0
    );

    const claimReady =
      identity.status === 'active' &&
      walletVerified &&
      fingerprintRecorded &&
      riskScore < 50;

    return jsonResponse({
      ok: true,
      authenticated: true,
      identity: {
        id: identity.id,
        primaryWalletAddress,
        walletAddress: sessionWalletAddress,
        humanConfidenceScore,
        riskScore,
        status: identity.status,
        walletVerified,
        fingerprintRecorded,
        xLinked,
        claimReady,
        linkedWalletCount,
      },
    });
  } catch (error) {
    console.error('[auth/status] error:', error);

    return jsonResponse(
      {
        ok: false,
        error: 'Failed to read identity status.',
      },
      500
    );
  }
}