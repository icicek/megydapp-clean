// app/api/auth/me/route.ts

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
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
    const token = cookieStore.get(USER_AUTH_COOKIE)?.value;

    if (!token) {
      return jsonResponse({
        ok: true,
        authenticated: false,
      });
    }

    const session = verifyUserSession(token);

    if (!session) {
      return jsonResponse({
        ok: true,
        authenticated: false,
      });
    }

    const sessionWalletAddress = normalizeWalletAddress(
      session.walletAddress
    );

    if (!sessionWalletAddress) {
      console.error(
        '[auth/me] invalid wallet address in session:',
        session.walletAddress
      );

      return jsonResponse({
        ok: true,
        authenticated: false,
      });
    }

    const rows = await sql`
      SELECT
        id,
        primary_wallet_address,
        human_confidence_score,
        risk_score,
        status
      FROM identities
      WHERE id = ${session.identityId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return jsonResponse({
        ok: true,
        authenticated: false,
      });
    }

    const identity = rows[0];

    const primaryWalletAddress = normalizeWalletAddress(
      identity.primary_wallet_address
    );

    if (!primaryWalletAddress) {
      console.error(
        '[auth/me] invalid primary wallet address for identity:',
        session.identityId
      );

      return jsonResponse(
        {
          ok: false,
          error: 'Failed to read user session.',
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      authenticated: true,
      identity: {
        id: identity.id,
        primaryWalletAddress,
        walletAddress: sessionWalletAddress,
        humanConfidenceScore:
          identity.human_confidence_score,
        riskScore: identity.risk_score,
        status: identity.status,
      },
    });
  } catch (error) {
    console.error('[auth/me] error:', error);

    return jsonResponse(
      {
        ok: false,
        error: 'Failed to read user session.',
      },
      500
    );
  }
}