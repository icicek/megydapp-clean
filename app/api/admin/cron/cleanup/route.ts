// app/api/admin/cron/cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  getDatabaseUrl,
} from '@/app/api/_lib/database-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSql() {
  return neon(
    getDatabaseUrl()
  );
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  try {
    const sql = getSql();

    const deletedCronRuns = await sql`
      DELETE FROM cron_runs
      WHERE ran_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `;

    const deletedTokenAudit = await sql`
      DELETE FROM token_audit
      WHERE ran_at < NOW() - INTERVAL '365 days'
      RETURNING id
    `;

    /*
     * Authentication nonces are short-lived operational records.
     *
     * Keep them for 7 days after expiration so that recent auth
     * incidents can still be inspected, but do not retain them
     * indefinitely.
     */
    const deletedUserNonces = await sql`
      DELETE FROM user_nonces
      WHERE expires_at < NOW() - INTERVAL '7 days'
      RETURNING id
    `;

    /*
     * Identity Link Codes are short-lived linking challenges.
     *
     * Keep expired/used records for 30 days for troubleshooting
     * and audit visibility, then remove them.
     */
    const deletedIdentityLinkCodes = await sql`
      DELETE FROM identity_link_codes
      WHERE
        (
          expires_at < NOW() - INTERVAL '30 days'
          OR used_at < NOW() - INTERVAL '30 days'
        )
      RETURNING id
    `;

    /*
     * Refund request challenges are replay-protection records.
     *
     * Retain expired/used challenges for 30 days, then remove them.
     */
    const deletedRefundRequestChallenges = await sql`
      DELETE FROM refund_request_challenges
      WHERE
        (
          expires_at < NOW() - INTERVAL '30 days'
          OR used_at < NOW() - INTERVAL '30 days'
        )
      RETURNING id
    `;

    const deletedTotal =
      deletedCronRuns.length +
      deletedTokenAudit.length +
      deletedUserNonces.length +
      deletedIdentityLinkCodes.length +
      deletedRefundRequestChallenges.length;

    return NextResponse.json({
      ok: true,

      deleted_cron_runs:
        deletedCronRuns.length,

      deleted_token_audit:
        deletedTokenAudit.length,

      deleted_user_nonces:
        deletedUserNonces.length,

      deleted_identity_link_codes:
        deletedIdentityLinkCodes.length,

      deleted_refund_request_challenges:
        deletedRefundRequestChallenges.length,

      deleted_total:
        deletedTotal,
    });
  } catch (e: any) {
    console.error(
      '[DB_CLEANUP_CRON] cleanup failed:',
      e
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          e?.message || 'cleanup_failed',
      },
      { status: 500 }
    );
  }
}