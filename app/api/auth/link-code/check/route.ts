// app/api/auth/link-code/check/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { sql } from '@/app/api/_lib/db';

export const runtime = 'nodejs';
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
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    return null;
  }

  try {
    return new PublicKey(rawValue).toBase58();
  } catch {
    return null;
  }
}

function normalizeLinkCode(
  value: unknown
): string | null {
  const code = String(value ?? '')
    .trim()
    .toUpperCase();

  if (!/^MEGY-\d{8}$/.test(code)) {
    return null;
  }

  return code;
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;

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

    const walletAddress =
      normalizeWalletAddress(body.walletAddress);

    if (!walletAddress) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet address.',
        },
        400
      );
    }

    const code = normalizeLinkCode(body.code);

    if (!code) {
      return jsonResponse({
        ok: true,
        available: false,
        reason: 'invalid_code',
      });
    }

    /*
     * First verify that the code is active and belongs to an
     * active Identity.
     *
     * Unknown, expired, used and inactive-Identity codes share
     * the same public response.
     */
    const codeRows = await sql`
      SELECT link_code.id
      FROM identity_link_codes link_code
      JOIN identities identity
        ON identity.id = link_code.identity_id
      WHERE link_code.code = ${code}
        AND link_code.purpose = 'link_wallet'
        AND link_code.used_at IS NULL
        AND link_code.expires_at > NOW()
        AND identity.status = 'active'
      LIMIT 1
    `;

    if (codeRows.length === 0) {
      return jsonResponse({
        ok: true,
        available: false,
        reason: 'expired_or_used',
      });
    }

    /*
     * Only after validating the Link Code do we reveal whether
     * the requested wallet is already linked.
     *
     * Wallet transfers between Identities are not supported.
     */
    const existingWalletRows = await sql`
      SELECT identity_id
      FROM identity_wallets
      WHERE wallet_address = ${walletAddress}
        AND chain = 'solana'
      LIMIT 1
    `;

    if (existingWalletRows.length > 0) {
      return jsonResponse({
        ok: true,
        available: false,
        reason: 'wallet_already_linked',
      });
    }

    return jsonResponse({
      ok: true,
      available: true,
      reason: null,
    });
  } catch (error) {
    console.error(
      '[auth/link-code/check] error:',
      error
    );

    return jsonResponse(
      {
        ok: false,
        error: 'Failed to check Identity Link Code.',
      },
      500
    );
  }
}