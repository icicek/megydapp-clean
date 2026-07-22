// app/api/auth/verify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

import { sql } from '@/app/api/_lib/db';
import {
  buildUserAuthMessage,
  getUserCookieOptions,
  signUserSession,
  USER_AUTH_COOKIE,
} from '@/app/api/_lib/user-auth';
import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';
import { awardReferralSignupIdentityAware } from '@/app/api/_lib/corepoints';

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

    const walletRows = await sql`
      SELECT identity_id
      FROM identity_wallets
      WHERE wallet_address = ${walletAddress}
        AND chain = 'solana'
      LIMIT 1
    `;

    let identityId: string;
    let wasNewIdentity = false;

    const existingIdentityId =
      walletRows[0]?.identity_id;

    if (existingIdentityId) {
      identityId = String(existingIdentityId);

      await sql`
        UPDATE identity_wallets
        SET last_seen_at = NOW(),
            verified_at = NOW()
        WHERE identity_id = ${identityId}
          AND wallet_address = ${walletAddress}
          AND chain = 'solana'
      `;
    } else {
      wasNewIdentity = true;

      const identityRows = await sql`
        INSERT INTO identities (
          primary_wallet_address,
          human_confidence_score,
          risk_score,
          status
        )
        VALUES (
          ${walletAddress},
          25,
          0,
          'active'
        )
        RETURNING id
      `;

      const createdIdentityId = identityRows[0]?.id;

      if (!createdIdentityId) {
        throw new Error(
          'Identity creation did not return an ID.'
        );
      }

      identityId = String(createdIdentityId);

      await sql`
        INSERT INTO identity_wallets (
          identity_id,
          wallet_address,
          chain,
          is_primary,
          verified_at
        )
        VALUES (
          ${identityId},
          ${walletAddress},
          'solana',
          true,
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
          'wallet_signature_verified',
          'info',
          0,
          ${JSON.stringify({
            chain: 'solana',
          })}::jsonb
        )
      `;
    }

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