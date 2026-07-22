// app/api/auth/link-wallet/nonce/route.ts

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

function normalizeWalletAddress(value: unknown): string | null {
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

function buildLinkWalletMessage(
  walletAddress: string,
  nonce: string
) {
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
      return jsonResponse(
        {
          ok: false,
          error: 'Identity session required.',
        },
        401
      );
    }

    const session = verifyUserSession(token);

    if (!session) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid identity session.',
        },
        401
      );
    }

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

    const walletAddress = normalizeWalletAddress(
      body.walletAddress
    );

    if (!walletAddress) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet address.',
        },
        400
      );
    }

    const sessionWalletAddress = normalizeWalletAddress(
      session.walletAddress
    );

    if (!sessionWalletAddress) {
      console.error(
        '[auth/link-wallet/nonce] invalid wallet address in session:',
        session.walletAddress
      );

      return jsonResponse(
        {
          ok: false,
          error: 'Invalid identity session.',
        },
        401
      );
    }

    if (walletAddress === sessionWalletAddress) {
      return jsonResponse(
        {
          ok: false,
          error: 'This wallet is already your active wallet.',
        },
        400
      );
    }

    const existingWalletRows = await sql`
      SELECT identity_id
      FROM identity_wallets
      WHERE wallet_address = ${walletAddress}
        AND chain = 'solana'
      LIMIT 1
    `;

    const existingIdentityId =
      existingWalletRows[0]?.identity_id;

    if (existingIdentityId) {
      if (
        String(existingIdentityId) ===
        String(session.identityId)
      ) {
        return jsonResponse(
          {
            ok: false,
            error: 'This wallet is already linked to your identity.',
          },
          409
        );
      }

      return jsonResponse(
        {
          ok: false,
          error: 'This wallet is already linked to another identity.',
        },
        409
      );
    }

    /*
     * Only one active link-wallet nonce is kept for the same
     * Identity and target wallet pair.
     */
    await sql`
      UPDATE user_nonces
      SET used_at = NOW()
      WHERE identity_id = ${session.identityId}
        AND wallet_address = ${walletAddress}
        AND purpose = 'link_wallet'
        AND used_at IS NULL
    `;

    const nonce = createUserNonce();
    const message = buildLinkWalletMessage(
      walletAddress,
      nonce
    );

    await sql`
      INSERT INTO user_nonces (
        identity_id,
        wallet_address,
        nonce,
        purpose,
        expires_at
      )
      VALUES (
        ${session.identityId},
        ${walletAddress},
        ${nonce},
        'link_wallet',
        NOW() + INTERVAL '10 minutes'
      )
    `;

    return jsonResponse({
      ok: true,
      walletAddress,
      nonce,
      message,
      identityId: session.identityId,
    });
  } catch (error) {
    console.error(
      '[auth/link-wallet/nonce] error:',
      error
    );

    return jsonResponse(
      {
        ok: false,
        error: 'Failed to create wallet link nonce.',
      },
      500
    );
  }
}