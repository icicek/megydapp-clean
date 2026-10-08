// app/api/admin/cron/cleanup/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl } from '@/app/api/_lib/database-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Maximum number of records deleted per table, per cleanup run.
const CLEANUP_BATCH_SIZE = 1000;

function getSql() {
  return neon(getDatabaseUrl());
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET ?? '';

  // Fail closed when the server secret is missing.
  if (!expected) {
    console.error('[DB_CLEANUP_CRON] Missing CRON_SECRET');

    return NextResponse.json(
      { ok: false, error: 'server_missing_cron_secret' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  if (!secret || secret !== expected) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  try {
    const sql = getSql();

    // Keep cron history for 30 days.
    const deletedCronRuns = await sql`
      WITH candidates AS (
        SELECT id
        FROM cron_runs
        WHERE ran_at < NOW() - INTERVAL '30 days'
        ORDER BY ran_at, id
        LIMIT ${CLEANUP_BATCH_SIZE}
      ),
      deleted AS (
        DELETE FROM cron_runs
        WHERE id IN (SELECT id FROM candidates)
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;

    // Keep token audit history for 365 days.
    const deletedTokenAudit = await sql`
      WITH candidates AS (
        SELECT id
        FROM token_audit
        WHERE ran_at < NOW() - INTERVAL '365 days'
        ORDER BY ran_at, id
        LIMIT ${CLEANUP_BATCH_SIZE}
      ),
      deleted AS (
        DELETE FROM token_audit
        WHERE id IN (SELECT id FROM candidates)
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;

    // Keep authentication nonces for 7 days after expiration.
    const deletedUserNonces = await sql`
      WITH candidates AS (
        SELECT id
        FROM user_nonces
        WHERE expires_at < NOW() - INTERVAL '7 days'
        ORDER BY expires_at, id
        LIMIT ${CLEANUP_BATCH_SIZE}
      ),
      deleted AS (
        DELETE FROM user_nonces
        WHERE id IN (SELECT id FROM candidates)
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;

    // Keep expired or used identity link codes for 30 days.
    const deletedIdentityLinkCodes = await sql`
      WITH candidates AS (
        SELECT id
        FROM identity_link_codes
        WHERE
          expires_at < NOW() - INTERVAL '30 days'
          OR used_at < NOW() - INTERVAL '30 days'
        ORDER BY id
        LIMIT ${CLEANUP_BATCH_SIZE}
      ),
      deleted AS (
        DELETE FROM identity_link_codes
        WHERE id IN (SELECT id FROM candidates)
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;

    // Keep expired or used refund challenges for 30 days.
    const deletedRefundRequestChallenges = await sql`
      WITH candidates AS (
        SELECT id
        FROM refund_request_challenges
        WHERE
          expires_at < NOW() - INTERVAL '30 days'
          OR used_at < NOW() - INTERVAL '30 days'
        ORDER BY id
        LIMIT ${CLEANUP_BATCH_SIZE}
      ),
      deleted AS (
        DELETE FROM refund_request_challenges
        WHERE id IN (SELECT id FROM candidates)
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;

    const cronRunsCount = Number(deletedCronRuns[0]?.count ?? 0);
    const tokenAuditCount = Number(deletedTokenAudit[0]?.count ?? 0);
    const userNoncesCount = Number(deletedUserNonces[0]?.count ?? 0);
    const identityLinkCodesCount = Number(
      deletedIdentityLinkCodes[0]?.count ?? 0
    );
    const refundRequestChallengesCount = Number(
      deletedRefundRequestChallenges[0]?.count ?? 0
    );

    const deletedTotal =
      cronRunsCount +
      tokenAuditCount +
      userNoncesCount +
      identityLinkCodesCount +
      refundRequestChallengesCount;

    return NextResponse.json(
      {
        ok: true,
        deleted_cron_runs: cronRunsCount,
        deleted_token_audit: tokenAuditCount,
        deleted_user_nonces: userNoncesCount,
        deleted_identity_link_codes: identityLinkCodesCount,
        deleted_refund_request_challenges: refundRequestChallengesCount,
        deleted_total: deletedTotal,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (e: unknown) {
    console.error('[DB_CLEANUP_CRON] cleanup failed:', e);

    return NextResponse.json(
      {
        ok: false,
        error: 'cleanup_failed',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}