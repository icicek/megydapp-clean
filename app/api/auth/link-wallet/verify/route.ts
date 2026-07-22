// app/api/auth/link-wallet/verify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

import { sql } from '@/app/api/_lib/db';
import {
  USER_AUTH_COOKIE,
  verifyUserSession,
} from '@/app/api/_lib/user-auth';
import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';

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

function decodeWalletSignature(
  value: unknown
): Uint8Array | null {
  const signatureBase64 = String(value ?? '').trim();

  if (!signatureBase64) {
    return null;
  }

  /*
   * Standard Base64 only. Solana wallet adapters generally return
   * Uint8Array signatures that the client serializes as Base64.
   */
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(signatureBase64) ||
    signatureBase64.length % 4 !== 0
  ) {
    return null;
  }

  try {
    const decoded = Buffer.from(signatureBase64, 'base64');

    /*
     * Ed25519 detached signatures are exactly 64 bytes.
     */
    if (decoded.length !== nacl.sign.signatureLength) {
      return null;
    }

    /*
     * Reject malformed Base64 strings that Node may otherwise
     * decode permissively.
     */
    const normalizedInput = signatureBase64.replace(/=+$/, '');
    const normalizedDecoded = decoded
      .toString('base64')
      .replace(/=+$/, '');

    if (normalizedInput !== normalizedDecoded) {
      return null;
    }

    return new Uint8Array(decoded);
  } catch {
    return null;
  }
}

function getPostgresErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return null;
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

    const nonce = String(body.nonce ?? '').trim();

    if (!nonce) {
      return jsonResponse(
        {
          ok: false,
          error: 'Missing nonce.',
        },
        400
      );
    }

    const signatureBytes = decodeWalletSignature(
      body.signature
    );

    if (!signatureBytes) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet signature format.',
        },
        400
      );
    }

    const sessionWalletAddress = normalizeWalletAddress(
      session.walletAddress
    );

    if (!sessionWalletAddress) {
      console.error(
        '[auth/link-wallet/verify] invalid wallet address in session:',
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

    /*
     * The nonce must belong to:
     *
     * - the currently authenticated Identity,
     * - the target wallet,
     * - the link_wallet purpose,
     * - an unused and unexpired request.
     */
    const nonceRows = await sql`
      SELECT id
      FROM user_nonces
      WHERE identity_id = ${session.identityId}
        AND wallet_address = ${walletAddress}
        AND nonce = ${nonce}
        AND purpose = 'link_wallet'
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (nonceRows.length === 0) {
      return jsonResponse(
        {
          ok: false,
          error:
            'Wallet link request expired, was already used, or does not belong to this identity.',
        },
        401
      );
    }

    const publicKey = new PublicKey(walletAddress);
    const expectedMessage = buildLinkWalletMessage(
      walletAddress,
      nonce
    );

    const messageBytes = new TextEncoder().encode(
      expectedMessage
    );

    const isValidSignature = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );

    if (!isValidSignature) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet signature.',
        },
        401
      );
    }

    /*
     * This is an early UX check only.
     *
     * The database UNIQUE index remains the final authority against
     * concurrent requests and duplicate wallet links.
     */
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

    try {
      /*
       * Atomic database operation:
       *
       * 1. Consume the exact Identity-bound nonce.
       * 2. Insert the wallet only if nonce consumption succeeded.
       *
       * If the wallet INSERT fails, PostgreSQL rolls back the entire
       * statement, including the nonce update.
       */
      const linkedWalletRows = await sql`
        WITH consumed_nonce AS (
          UPDATE user_nonces
          SET used_at = NOW()
          WHERE id = ${nonceRows[0].id}
            AND identity_id = ${session.identityId}
            AND wallet_address = ${walletAddress}
            AND nonce = ${nonce}
            AND purpose = 'link_wallet'
            AND used_at IS NULL
            AND expires_at > NOW()
          RETURNING id
        )
        INSERT INTO identity_wallets (
          identity_id,
          wallet_address,
          chain,
          is_primary,
          verified_at,
          last_seen_at
        )
        SELECT
          ${session.identityId},
          ${walletAddress},
          'solana',
          false,
          NOW(),
          NOW()
        FROM consumed_nonce
        RETURNING
          identity_id,
          wallet_address
      `;

      /*
       * Empty RETURNING means another concurrent request consumed
       * the nonce before this request could do so.
       */
      if (linkedWalletRows.length === 0) {
        return jsonResponse(
          {
            ok: false,
            error: 'Nonce expired or already used.',
          },
          401
        );
      }
    } catch (error) {
      /*
       * PostgreSQL unique_violation.
       *
       * The unique index on (chain, wallet_address) guarantees that
       * concurrent requests cannot attach one wallet more than once.
       */
      if (getPostgresErrorCode(error) === '23505') {
        const conflictingWalletRows = await sql`
          SELECT identity_id
          FROM identity_wallets
          WHERE wallet_address = ${walletAddress}
            AND chain = 'solana'
          LIMIT 1
        `;

        const conflictingIdentityId =
          conflictingWalletRows[0]?.identity_id;

        if (
          conflictingIdentityId &&
          String(conflictingIdentityId) ===
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

      throw error;
    }

    /*
     * Risk logging and score recalculation are secondary operations.
     * A failure here must not undo a successfully verified wallet link.
     */
    try {
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
            activeWalletAddress: sessionWalletAddress,
          })}::jsonb
        )
      `;
    } catch (error) {
      console.error(
        '[auth/link-wallet/verify] risk event insert failed:',
        error
      );
    }

    try {
      await recalculateIdentityScores(
        session.identityId
      );
    } catch (error) {
      console.error(
        '[auth/link-wallet/verify] identity score recalculation failed:',
        error
      );
    }

    return jsonResponse({
      ok: true,
      identityId: session.identityId,
      walletAddress,
      linked: true,
    });
  } catch (error) {
    console.error(
      '[auth/link-wallet/verify] error:',
      error
    );

    return jsonResponse(
      {
        ok: false,
        error: 'Failed to link wallet.',
      },
      500
    );
  }
}