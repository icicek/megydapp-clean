// app/api/leaderboard/route.ts
import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export async function GET() {
  try {
    const rows = await sql`
      WITH wallet_points AS (
        SELECT
          wallet_address,
          COALESCE(SUM(points), 0)::float AS core_point
        FROM corepoint_events
        GROUP BY wallet_address
        HAVING COALESCE(SUM(points), 0) > 0
      ),
      scoped AS (
        SELECT
          wp.wallet_address,
          wp.core_point,
          iw.identity_id,
          COALESCE(iw.identity_id::text, 'wallet:' || wp.wallet_address) AS scope_key
        FROM wallet_points wp
        LEFT JOIN identity_wallets iw
          ON iw.chain = 'solana'
         AND LOWER(iw.wallet_address) = LOWER(wp.wallet_address)
      ),
      identity_totals AS (
        SELECT
          scope_key,
          MAX(identity_id::text) AS identity_id,
          MIN(wallet_address) AS wallet_address,
          COALESCE(SUM(core_point), 0)::float AS core_point
        FROM scoped
        GROUP BY scope_key
      )
      SELECT
        it.scope_key,
        it.identity_id,
        CASE
          WHEN it.identity_id IS NOT NULL THEN CONCAT('Identity #', LEFT(it.identity_id, 6))
          ELSE NULL
        END AS identity_label,
        it.wallet_address,
        it.core_point,
        CASE
          WHEN it.identity_id IS NOT NULL THEN (
            SELECT COUNT(*)::int
            FROM identity_wallets iw2
            WHERE iw2.identity_id::text = it.identity_id
              AND iw2.chain = 'solana'
          )
          ELSE 1
        END AS linked_wallet_count,
        CASE
          WHEN it.identity_id IS NOT NULL THEN (
            SELECT ARRAY_AGG(iw3.wallet_address ORDER BY iw3.created_at ASC)
            FROM identity_wallets iw3
            WHERE iw3.identity_id::text = it.identity_id
              AND iw3.chain = 'solana'
          )
          ELSE ARRAY[it.wallet_address]
        END AS wallet_addresses
      FROM identity_totals it
      WHERE it.core_point > 0
      ORDER BY it.core_point DESC
      LIMIT 50;
    `;

    return NextResponse.json({
      success: true,
      leaderboard: rows,
    });
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}