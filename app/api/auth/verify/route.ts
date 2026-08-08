// app/api/auth/verify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  Client,
  neonConfig,
} from '@neondatabase/serverless';
import ws from 'ws';
import nacl from 'tweetnacl';
import {
  getDatabaseUrl,
} from '@/app/api/_lib/database-url';

import { sql } from '@/app/api/_lib/db';
import {
  buildUserAuthMessage,
  getUserCookieOptions,
  isIdentityAuthIntent,
  signUserSession,
  USER_AUTH_COOKIE,
  type IdentityAuthIntent,
} from '@/app/api/_lib/user-auth';
import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';
import { awardReferralSignupIdentityAware } from '@/app/api/_lib/corepoints';

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function normalizeWalletAddress(
  value: unknown
): {
  walletAddress: string;
  publicKey: PublicKey;
} {
  const rawWalletAddress = String(value ?? '').trim();

  if (!rawWalletAddress) {
    throw new Error('Invalid wallet address.');
  }

  try {
    const publicKey = new PublicKey(rawWalletAddress);

    return {
      walletAddress: publicKey.toBase58(),
      publicKey,
    };
  } catch {
    throw new Error('Invalid wallet address.');
  }
}

function decodeWalletSignature(
  signatureBase64: string
): Uint8Array | null {
  /*
   * Solana wallet signatures are Ed25519 signatures and must
   * decode to exactly 64 bytes.
   *
   * This validation accepts ordinary padded or unpadded Base64,
   * but rejects whitespace, Base64URL characters and malformed
   * padding before decoding.
   */
  if (
    !signatureBase64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64) ||
    signatureBase64.length % 4 === 1
  ) {
    return null;
  }

  try {
    const signatureBytes = Buffer.from(
      signatureBase64,
      'base64'
    );

    if (signatureBytes.length !== nacl.sign.signatureLength) {
      return null;
    }

    return new Uint8Array(signatureBytes);
  } catch {
    return null;
  }
}

type IdentityResolutionResult = {
  identityId: string;
  wasNewIdentity: boolean;
};

async function resolveOrCreateIdentity(
  walletAddress: string,
  intent: IdentityAuthIntent
): Promise<IdentityResolutionResult> {
  /*
   * Fast path:
   * Existing wallets do not need an interactive transaction.
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
    const identityId = String(existingIdentityId);

    const updatedWalletRows = await sql`
      UPDATE identity_wallets
      SET
        last_seen_at = NOW(),
        verified_at = NOW()
      WHERE identity_id = ${identityId}
        AND wallet_address = ${walletAddress}
        AND chain = 'solana'
      RETURNING identity_id
    `;

    if (updatedWalletRows.length === 0) {
      throw new Error(
        'Existing Identity wallet could not be updated.'
      );
    }

    return {
      identityId,
      wasNewIdentity: false,
    };
  }

  /*
   * Slow path:
   * The wallet appeared to be new. Use one interactive
   * transaction and a wallet-specific advisory lock.
   *
   * The lock prevents two concurrent requests for the same
   * wallet from creating separate Identity records.
   */
  const client = new Client(DATABASE_URL);

  await client.connect();

  let transactionFinished = false;

  try {
    await client.query('BEGIN');

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtextextended($1, 0)
        )
      `,
      [`coincarnation:identity:solana:${walletAddress}`]
    );

    /*
     * Re-check after obtaining the lock. Another request may
     * have created the wallet-to-Identity relation while this
     * request was waiting.
     */
    const lockedWalletResult =
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

    const lockedExistingIdentityId =
      lockedWalletResult.rows[0]?.identity_id;

    if (lockedExistingIdentityId) {
      const identityId = String(
        lockedExistingIdentityId
      );

      const updatedWalletResult =
        await client.query<{
          identity_id: string;
        }>(
          `
            UPDATE identity_wallets
            SET
              last_seen_at = NOW(),
              verified_at = NOW()
            WHERE identity_id = $1
              AND wallet_address = $2
              AND chain = 'solana'
            RETURNING identity_id
          `,
          [identityId, walletAddress]
        );

      if (updatedWalletResult.rows.length === 0) {
        throw new Error(
          'Locked Identity wallet could not be updated.'
        );
      }

      await client.query('COMMIT');
      transactionFinished = true;

      return {
        identityId,
        wasNewIdentity: false,
      };
    }

    /*
    * A wallet signature alone must never create an Identity.
    *
    * New Identity creation requires an explicit create_identity
    * intent that was cryptographically bound to the signed
    * authentication message.
    */
    if (intent !== 'create_identity') {
      throw new Error('WALLET_NOT_LINKED');
    }

    const identityResult =
      await client.query<{
        id: string;
      }>(
        `
          INSERT INTO identities (
            primary_wallet_address,
            human_confidence_score,
            risk_score,
            status
          )
          VALUES ($1, 25, 0, 'active')
          RETURNING id
        `,
        [walletAddress]
      );

    const createdIdentityId =
      identityResult.rows[0]?.id;

    if (!createdIdentityId) {
      throw new Error(
        'Identity creation did not return an ID.'
      );
    }

    const identityId = String(createdIdentityId);

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
          true,
          NOW(),
          NOW()
        )
      `,
      [identityId, walletAddress]
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
          'wallet_signature_verified',
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
        }),
      ]
    );

    await client.query('COMMIT');
    transactionFinished = true;

    return {
      identityId,
      wasNewIdentity: true,
    };
  } catch (error) {
    if (!transactionFinished) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          '[auth/verify] identity transaction rollback failed:',
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
        '[auth/verify] database client close failed:',
        closeError
      );
    }
  }
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

    let walletAddress: string;
    let publicKey: PublicKey;

    try {
      const normalizedWallet = normalizeWalletAddress(
        body.walletAddress
      );

      walletAddress = normalizedWallet.walletAddress;
      publicKey = normalizedWallet.publicKey;
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet address.',
        },
        400
      );
    }

    const intent = body.intent;

    if (!isIdentityAuthIntent(intent)) {
      return jsonResponse(
        {
          ok: false,
          code: 'INVALID_AUTH_INTENT',
          error: 'Invalid identity auth intent.',
        },
        400
      );
    }

    const nonce = String(body.nonce ?? '').trim();
    const signatureBase64 = String(
      body.signature ?? ''
    ).trim();

    if (!nonce || !signatureBase64) {
      return jsonResponse(
        {
          ok: false,
          error: 'Missing nonce or signature.',
        },
        400
      );
    }

    /*
     * Reading the nonce is necessary before signature verification
     * so the server can reconstruct the exact message that the wallet
     * was expected to sign.
     *
     * The nonce is not considered consumed at this stage. Its actual
     * consumption happens atomically after signature verification.
     */
    const nonceRows = await sql`
      SELECT id
      FROM user_nonces
      WHERE wallet_address = ${walletAddress}
        AND nonce = ${nonce}
        AND purpose = 'user_auth'
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const nonceRow = nonceRows[0];

    if (!nonceRow?.id) {
      return jsonResponse(
        {
          ok: false,
          error: 'Nonce expired or already used.',
        },
        401
      );
    }

    const signatureBytes =
      decodeWalletSignature(signatureBase64);

    if (!signatureBytes) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet signature.',
        },
        401
      );
    }

    const expectedMessage = buildUserAuthMessage(
      walletAddress,
      nonce,
      intent
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
     * Atomically consume the nonce.
     *
     * Two concurrent requests may both read and verify the same
     * nonce, but only one can satisfy this UPDATE condition.
     * The second request receives no returned row and is rejected.
     */
    const consumedNonceRows = await sql`
      UPDATE user_nonces
      SET used_at = NOW()
      WHERE id = ${nonceRow.id}
        AND wallet_address = ${walletAddress}
        AND nonce = ${nonce}
        AND purpose = 'user_auth'
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING id
    `;

    if (consumedNonceRows.length === 0) {
      return jsonResponse(
        {
          ok: false,
          error: 'Nonce expired or already used.',
        },
        401
      );
    }

    let identityResolution: IdentityResolutionResult;

    try {
      identityResolution =
        await resolveOrCreateIdentity(
          walletAddress,
          intent
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'WALLET_NOT_LINKED'
      ) {
        return jsonResponse(
          {
            ok: false,
            code: 'WALLET_NOT_LINKED',
            error:
              'This wallet is not linked to a Coincarnation Identity.',
          },
          409
        );
      }

      throw error;
    }

    const {
      identityId,
      wasNewIdentity,
    } = identityResolution;

    /*
     * Referral reward failure must never block authentication.
     * This preserves the existing product behavior.
     */
    if (wasNewIdentity) {
      try {
        const pendingReferralRows = await sql`
          SELECT
            referrer_wallet,
            referral_code
          FROM contributions
          WHERE wallet_address = ${walletAddress}
            AND referrer_wallet IS NOT NULL
          ORDER BY "timestamp" ASC
          LIMIT 1
        `;

        const pendingReferral =
          pendingReferralRows[0];

        if (pendingReferral?.referrer_wallet) {
          const referralResult =
            await awardReferralSignupIdentityAware({
              referrer: String(
                pendingReferral.referrer_wallet
              ),
              referee: walletAddress,
              referralCode:
                pendingReferral.referral_code
                  ? String(
                      pendingReferral.referral_code
                    )
                  : null,
            });

          console.log(
            '[auth/verify] referral identity award result:',
            referralResult
          );
        }
      } catch (error) {
        console.warn(
          '[auth/verify] referral identity award failed:',
          getErrorMessage(error)
        );
      }
    }

    /*
     * Score recalculation is intentionally non-blocking.
     * Authentication remains available if recalculation temporarily
     * fails; the error is retained in server logs for investigation.
     */
    try {
      await recalculateIdentityScores(identityId);
    } catch (error) {
      console.error(
        '[identity-score] recalculate failed:',
        error
      );
    }

    const latestIdentityRows = await sql`
      SELECT
        human_confidence_score,
        risk_score,
        status
      FROM identities
      WHERE id = ${identityId}
      LIMIT 1
    `;

    const latestIdentity = latestIdentityRows[0];

    if (!latestIdentity) {
      throw new Error(
        'Verified Identity could not be loaded.'
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
      humanConfidenceScore: Number(
        latestIdentity.human_confidence_score ?? 0
      ),
      riskScore: Number(
        latestIdentity.risk_score ?? 0
      ),
      status: String(
        latestIdentity.status ?? 'active'
      ),
    });

    response.cookies.set(
      USER_AUTH_COOKIE,
      token,
      getUserCookieOptions()
    );

    return response;
  } catch (error) {
    console.error('[auth/verify] error:', error);

    return jsonResponse(
      {
        ok: false,
        error: 'Failed to verify wallet signature.',
      },
      500
    );
  }
}