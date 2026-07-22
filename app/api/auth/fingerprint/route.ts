// app/api/auth/fingerprint/route.ts

import crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { sql } from '@/app/api/_lib/db';
import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';
import {
  USER_AUTH_COOKIE,
  verifyUserSession,
} from '@/app/api/_lib/user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FINGERPRINT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const SCORE_RECALCULATION_BATCH_SIZE = 10;

type IdentityIdRow = {
  identity_id: string | null;
};

type RiskEventRow = {
  id: string;
};

function normalizeSolanaWalletAddress(value: unknown): string | null {
  const walletAddress = String(value ?? '').trim();

  if (!walletAddress) {
    return null;
  }

  try {
    return new PublicKey(walletAddress).toBase58();
  } catch {
    return null;
  }
}

/**
 * Produces a non-reversible, keyed representation of an IP address.
 *
 * Raw IP addresses are never stored. If the dedicated secret is not
 * configured, IP collection is skipped rather than using a known fallback.
 */
function hashIp(ip: string): string | null {
  const secret = process.env.IDENTITY_IP_HASH_SECRET?.trim();

  if (!secret) {
    return null;
  }

  return crypto
    .createHmac('sha256', secret)
    .update(ip)
    .digest('hex');
}

function getRequestIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get('x-forwarded-for');

  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(',')[0]?.trim();

    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    null
  );
}

function normalizeSource(value: unknown): string {
  const source = String(value ?? 'web').trim();

  if (!SOURCE_PATTERN.test(source)) {
    return 'web';
  }

  return source.toLowerCase();
}

/**
 * Recalculates Identity scores in small batches.
 *
 * A shared fingerprint changes the shared-fingerprint count of every
 * Identity using it, not only the Identity making the current request.
 */
async function recalculateAffectedIdentityScores(
  identityIds: string[]
): Promise<number> {
  let failureCount = 0;

  for (
    let index = 0;
    index < identityIds.length;
    index += SCORE_RECALCULATION_BATCH_SIZE
  ) {
    const batch = identityIds.slice(
      index,
      index + SCORE_RECALCULATION_BATCH_SIZE
    );

    const results = await Promise.allSettled(
      batch.map((identityId) =>
        recalculateIdentityScores(identityId)
      )
    );

    results.forEach((result, resultIndex) => {
      if (result.status === 'rejected') {
        failureCount += 1;

        console.error(
          '[identity-score] fingerprint recalculation failed:',
          {
            identityId: batch[resultIndex],
            error: result.reason,
          }
        );

        return;
      }

      if (!result.value.ok) {
        failureCount += 1;

        console.error(
          '[identity-score] fingerprint recalculation returned an error:',
          {
            identityId: batch[resultIndex],
            error: result.value.error,
          }
        );
      }
    });
  }

  return failureCount;
}

export async function POST(req: NextRequest) {
  try {
    /*
     * Fingerprinting is optional for unauthenticated visitors.
     *
     * Returning HTTP 200 here allows the frontend to call this endpoint
     * without treating the absence of an Identity session as an error.
     */
    const cookieStore = await cookies();
    const token = cookieStore.get(USER_AUTH_COOKIE)?.value;
    const session = token ? verifyUserSession(token) : null;

    if (!session) {
      return NextResponse.json({
        ok: true,
        authenticated: false,
        recorded: false,
      });
    }

    const identityId = String(
      session.identityId ?? ''
    ).trim();

    if (!identityId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid Identity session.',
          code: 'INVALID_IDENTITY_SESSION',
        },
        { status: 401 }
      );
    }

    /*
     * The wallet is taken only from the verified server-side session.
     *
     * A walletAddress supplied by the client is intentionally ignored.
     * The address is audit metadata; the fingerprint itself belongs to
     * the Identity.
     */
    const walletAddress =
      normalizeSolanaWalletAddress(session.walletAddress);

    if (!walletAddress) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid wallet session.',
          code: 'INVALID_WALLET_SESSION',
        },
        { status: 401 }
      );
    }

    let body: Record<string, unknown>;

    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request body.',
          code: 'INVALID_REQUEST_BODY',
        },
        { status: 400 }
      );
    }

    const fingerprintHash = String(
      body.fingerprintHash ?? ''
    )
      .trim()
      .toLowerCase();

    if (!FINGERPRINT_HASH_PATTERN.test(fingerprintHash)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid fingerprint.',
          code: 'INVALID_FINGERPRINT',
        },
        { status: 400 }
      );
    }

    const source = normalizeSource(body.source);
    const userAgent =
      req.headers.get('user-agent')?.trim() || null;

    const ip = getRequestIp(req);
    const ipHash = ip ? hashIp(ip) : null;

    /*
     * Atomic upsert.
     *
     * Requires:
     *
     * UNIQUE (identity_id, fingerprint_hash)
     *
     * first_seen_at remains unchanged when an existing record is observed
     * again. last_seen_at and current audit metadata are refreshed.
     */
    await sql`
      INSERT INTO identity_fingerprints (
        identity_id,
        fingerprint_hash,
        wallet_address,
        user_agent,
        ip_hash,
        source,
        first_seen_at,
        last_seen_at
      )
      VALUES (
        ${identityId},
        ${fingerprintHash},
        ${walletAddress},
        ${userAgent},
        ${ipHash},
        ${source},
        NOW(),
        NOW()
      )
      ON CONFLICT (identity_id, fingerprint_hash)
      DO UPDATE
      SET
        wallet_address = EXCLUDED.wallet_address,
        user_agent = EXCLUDED.user_agent,
        ip_hash = EXCLUDED.ip_hash,
        source = EXCLUDED.source,
        last_seen_at = NOW()
    `;

    /*
     * Find every active Identity currently associated with this
     * fingerprint. All of their scores must be recalculated because the
     * shared-fingerprint count has changed for the entire group.
     */
    const affectedIdentityRows = (await sql`
      SELECT DISTINCT identity_id
      FROM identity_fingerprints
      WHERE fingerprint_hash = ${fingerprintHash}
        AND identity_id IS NOT NULL
    `) as unknown as IdentityIdRow[];

    const affectedIdentityIds = Array.from(
      new Set(
        affectedIdentityRows
          .map((row) =>
            String(row.identity_id ?? '').trim()
          )
          .filter(Boolean)
      )
    );

    const linkedOtherIdentities = Math.max(
      0,
      affectedIdentityIds.filter(
        (affectedIdentityId) =>
          affectedIdentityId !== identityId
      ).length
    );

    /*
     * Risk events are audit records only.
     *
     * Identity risk is recalculated from current fingerprint relationships
     * by identity-score.ts. score_delta therefore remains zero and must not
     * be interpreted as the source of the stored risk score.
     */
    if (linkedOtherIdentities > 0) {
      const existingRiskRows = (await sql`
        SELECT id
        FROM identity_risk_events
        WHERE identity_id = ${identityId}
          AND event_type = 'fingerprint_seen_across_identities'
          AND details->>'fingerprintHash' = ${fingerprintHash}
        LIMIT 1
      `) as unknown as RiskEventRow[];

      const riskDetails = JSON.stringify({
        fingerprintHash,
        linkedOtherIdentities,
        affectedIdentityCount: affectedIdentityIds.length,
        observedWithWalletAddress: walletAddress,
      });

      if (existingRiskRows.length > 0) {
        await sql`
          UPDATE identity_risk_events
          SET
            wallet_address = ${walletAddress},
            severity = 'warning',
            score_delta = 0,
            details = ${riskDetails}::jsonb
          WHERE id = ${existingRiskRows[0].id}
        `;
      } else {
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
            'fingerprint_seen_across_identities',
            'warning',
            0,
            ${riskDetails}::jsonb
          )
        `;
      }
    }

    /*
     * The current Identity should always be included because its
     * fingerprint record has just been inserted or refreshed.
     */
    if (!affectedIdentityIds.includes(identityId)) {
      affectedIdentityIds.push(identityId);
    }

    const scoreRecalculationFailures =
      await recalculateAffectedIdentityScores(
        affectedIdentityIds
      );

    return NextResponse.json({
      ok: true,
      authenticated: true,
      recorded: true,
      linkedOtherIdentities,
      affectedIdentityCount: affectedIdentityIds.length,
      scoresUpdated:
        affectedIdentityIds.length -
        scoreRecalculationFailures,
      scoreRecalculationFailures,
    });
  } catch (error) {
    console.error('[auth/fingerprint] error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to record fingerprint.',
        code: 'FINGERPRINT_RECORDING_FAILED',
      },
      { status: 500 }
    );
  }
}