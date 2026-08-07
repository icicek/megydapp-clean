// app/api/auth/link-code/verify/route.ts

import {
  Client,
  neonConfig,
} from '@neondatabase/serverless';
import { PublicKey } from '@solana/web3.js';
import { NextRequest, NextResponse } from 'next/server';
import nacl from 'tweetnacl';
import ws from 'ws';
import {
  getDatabaseUrl,
} from '@/app/api/_lib/database-url';

import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';
import {
  getUserCookieOptions,
  signUserSession,
  USER_AUTH_COOKIE,
} from '@/app/api/_lib/user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATABASE_URL =
  getDatabaseUrl();

neonConfig.webSocketConstructor = ws;

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
): {
  walletAddress: string;
  publicKey: PublicKey;
} | null {
  const rawWalletAddress =
    String(value ?? '').trim();

  if (!rawWalletAddress) {
    return null;
  }

  try {
    const publicKey =
      new PublicKey(rawWalletAddress);

    return {
      walletAddress: publicKey.toBase58(),
      publicKey,
    };
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

function decodeWalletSignature(
  value: unknown
): Uint8Array | null {
  const signatureBase64 =
    String(value ?? '').trim();

  if (
    !signatureBase64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      signatureBase64
    ) ||
    signatureBase64.length % 4 === 1
  ) {
    return null;
  }

  try {
    const signatureBytes = Buffer.from(
      signatureBase64,
      'base64'
    );

    if (
      signatureBytes.length !==
      nacl.sign.signatureLength
    ) {
      return null;
    }

    return new Uint8Array(signatureBytes);
  } catch {
    return null;
  }
}

function buildLinkCodeMessage(
  walletAddress: string,
  code: string
) {
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

type LinkWalletTransactionResult =
  | {
      ok: true;
      identityId: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

async function linkWalletTransaction(params: {
  walletAddress: string;
  code: string;
}): Promise<LinkWalletTransactionResult> {
  const {
    walletAddress,
    code,
  } = params;

  const client = new Client(DATABASE_URL);

  let transactionStarted = false;
  let transactionFinished = false;

  try {
    await client.connect();

    await client.query('BEGIN');
    transactionStarted = true;

    /*
     * Serialize operations involving both this Link Code and
     * this wallet.
     *
     * The Link Code lock prevents concurrent consumption.
     * The wallet lock prevents the same wallet from being
     * linked concurrently through different codes.
     */
    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtextextended($1, 0)
        )
      `,
      [`identity-link-code:${code}`]
    );

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtextextended($1, 0)
        )
      `,
      [`identity-wallet:solana:${walletAddress}`]
    );

    /*
     * The wallet cannot be moved between Identities.
     */
    const existingWalletResult =
      await client.query<{
        identity_id: string;
      }>(
        `
          SELECT identity_id
          FROM identity_wallets
          WHERE wallet_address = $1
            AND chain = 'solana'
          LIMIT 1
        `,
        [walletAddress]
      );

    if (existingWalletResult.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionFinished = true;

      return {
        ok: false,
        status: 400,
        error:
          'This wallet is already linked to an identity.',
      };
    }

    /*
     * Lock and read the Link Code row.
     *
     * FOR UPDATE prevents another transaction from consuming
     * this code until the current transaction finishes.
     */
    const codeResult =
      await client.query<{
        id: string;
        identity_id: string;
      }>(
        `
          SELECT
            id,
            identity_id
          FROM identity_link_codes
          WHERE code = $1
            AND purpose = 'link_wallet'
            AND used_at IS NULL
            AND expires_at > NOW()
          LIMIT 1
          FOR UPDATE
        `,
        [code]
      );

    const codeRow = codeResult.rows[0];

    if (!codeRow) {
      await client.query('ROLLBACK');
      transactionFinished = true;

      return {
        ok: false,
        status: 401,
        error:
          'Link code expired or already used.',
      };
    }

    const identityId =
      String(codeRow.identity_id);

    const identityResult =
      await client.query<{
        id: string;
      }>(
        `
          SELECT id
          FROM identities
          WHERE id = $1
            AND status = 'active'
          LIMIT 1
        `,
        [identityId]
      );

    if (identityResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionFinished = true;

      return {
        ok: false,
        status: 404,
        error:
          'Active identity not found.',
      };
    }

    /*
     * Consume the code atomically.
     *
     * The repeated conditions protect against unexpected state
     * changes even though the row is already locked.
     */
    const consumedCodeResult =
      await client.query<{
        id: string;
      }>(
        `
          UPDATE identity_link_codes
          SET used_at = NOW()
          WHERE id = $1
            AND used_at IS NULL
            AND expires_at > NOW()
          RETURNING id
        `,
        [codeRow.id]
      );

    if (consumedCodeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionFinished = true;

      return {
        ok: false,
        status: 401,
        error:
          'Link code expired or already used.',
      };
    }

    await client.query(
      `
        INSERT INTO identity_wallets (
          identity_id,
          wallet_address,
          chain,
          is_primary,
          verified_at,
          last_seen_at
        )
        VALUES (
          $1,
          $2,
          'solana',
          false,
          NOW(),
          NOW()
        )
      `,
      [
        identityId,
        walletAddress,
      ]
    );

    await client.query(
      `
        INSERT INTO identity_risk_events (
          identity_id,
          wallet_address,
          event_type,
          severity,
          score_delta,
          details
        )
        VALUES (
          $1,
          $2,
          'wallet_linked_by_recovery_code',
          'info',
          0,
          $3::jsonb
        )
      `,
      [
        identityId,
        walletAddress,
        JSON.stringify({
          chain: 'solana',
          code,
        }),
      ]
    );

    await client.query('COMMIT');
    transactionFinished = true;

    return {
      ok: true,
      identityId,
    };
  } catch (error) {
    if (
      transactionStarted &&
      !transactionFinished
    ) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          '[auth/link-code/verify] rollback failed:',
          rollbackError
        );
      }
    }

    throw error;
  } finally {
    try {
      await client.end();
    } catch (closeError) {
      console.error(
        '[auth/link-code/verify] client close failed:',
        closeError
      );
    }
  }
}

export async function POST(
  req: NextRequest
) {
  try {
    let body: Record<string, unknown>;

    try {
      const parsedBody =
        (await req.json()) as unknown;

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

      body =
        parsedBody as Record<string, unknown>;
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid request body.',
        },
        400
      );
    }

    const normalizedWallet =
      normalizeWalletAddress(
        body.walletAddress
      );

    if (!normalizedWallet) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet address.',
        },
        400
      );
    }

    const {
      walletAddress,
      publicKey,
    } = normalizedWallet;

    const code =
      normalizeLinkCode(body.code);

    if (!code) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid link code.',
        },
        400
      );
    }

    const signatureBytes =
      decodeWalletSignature(
        body.signature
      );

    if (!signatureBytes) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet signature.',
        },
        401
      );
    }

    const expectedMessage =
      buildLinkCodeMessage(
        walletAddress,
        code
      );

    const messageBytes =
      new TextEncoder().encode(
        expectedMessage
      );

    const isValid =
      nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKey.toBytes()
      );

    if (!isValid) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet signature.',
        },
        401
      );
    }

    /*
     * The preflight endpoint is only a UX optimization.
     * Every authorization condition is repeated here after
     * the wallet signature has been verified.
     */
    const transactionResult =
      await linkWalletTransaction({
        walletAddress,
        code,
      });

    if (!transactionResult.ok) {
      return jsonResponse(
        {
          ok: false,
          error: transactionResult.error,
        },
        transactionResult.status
      );
    }

    const {
      identityId,
    } = transactionResult;

    /*
     * Score recalculation is intentionally non-blocking.
     * The wallet relation and Link Code consumption have
     * already committed successfully.
     */
    try {
      await recalculateIdentityScores(
        identityId
      );
    } catch (error) {
      console.error(
        '[identity-score] recalculate failed:',
        error
      );
    }

    const token = signUserSession({
      identityId,
      walletAddress,
    });

    const response = jsonResponse({
      ok: true,
      identityId,
      walletAddress,
      linked: true,
    });

    response.cookies.set(
      USER_AUTH_COOKIE,
      token,
      getUserCookieOptions()
    );

    return response;
  } catch (error) {
    console.error(
      '[auth/link-code/verify] error:',
      error
    );

    return jsonResponse(
      {
        ok: false,
        error:
          'Failed to verify identity link code.',
      },
      500
    );
  }
}