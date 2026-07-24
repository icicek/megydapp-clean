// app/api/auth/nonce/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { sql } from '@/app/api/_lib/db';
import {
  buildUserAuthMessage,
  createUserNonce,
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
  walletAddress: unknown
): string {
  const value = String(walletAddress ?? '').trim();

  if (!value) {
    throw new Error('Invalid wallet address.');
  }

  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error('Invalid wallet address.');
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;

    /*
     * Accept only a JSON object.
     *
     * Values such as null, arrays, strings and numbers are valid JSON,
     * but they are not valid request bodies for this endpoint.
     */
    try {
      const parsedBody = (await req.json()) as unknown;

      if (
        typeof parsedBody !== 'object' ||
        parsedBody === null ||
        Array.isArray(parsedBody)
      ) {
        return jsonResponse(
          {
            ok: false,
            error: 'Invalid request body.',
          },
          400
        );
      }

      body = parsedBody as Record<string, unknown>;
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid request body.',
        },
        400
      );
    }

    let walletAddress: string;

    try {
      walletAddress = normalizeWalletAddress(
        body.walletAddress
      );
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet address.',
        },
        400
      );
    }

    const candidateNonce = createUserNonce();

    const nonceRows = await sql`
      INSERT INTO user_nonces (
        wallet_address,
        nonce,
        purpose,
        expires_at,
        used_at
      )
      VALUES (
        ${walletAddress},
        ${candidateNonce},
        'user_auth',
        NOW() + INTERVAL '10 minutes',
        NULL
      )
      ON CONFLICT (wallet_address, purpose)
        WHERE purpose = 'user_auth'
          AND used_at IS NULL
      DO UPDATE SET
        nonce = CASE
          WHEN user_nonces.expires_at <= NOW()
            THEN EXCLUDED.nonce
          ELSE user_nonces.nonce
        END,
        expires_at = CASE
          WHEN user_nonces.expires_at <= NOW()
            THEN EXCLUDED.expires_at
          ELSE user_nonces.expires_at
        END
      RETURNING id, nonce
    `;

    const nonceRow = nonceRows[0];

    if (!nonceRow?.id || !nonceRow?.nonce) {
      throw new Error(
        'Authentication nonce creation did not return a valid record.'
      );
    }

    const nonce = String(nonceRow.nonce);

    const message = buildUserAuthMessage(
      walletAddress,
      nonce
    );

    return jsonResponse({
      ok: true,
      walletAddress,
      nonce,
      message,
    });
  } catch (error) {
    console.error('[auth/nonce] error:', error);

    return jsonResponse(
      {
        ok: false,
        error: 'Failed to create auth nonce.',
      },
      500
    );
  }
}