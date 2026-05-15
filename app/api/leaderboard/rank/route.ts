// app/api/leaderboard/rank/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json(
      { success: false, error: 'Missing wallet param' },
      { status: 400 },
    );
  }

  try {
    const rows = await sql`
      WITH target_scope AS (
        SELECT COALESCE(
          (
            SELECT iw.identity_id::text
            FROM identity_wallets iw
            WHERE iw.chain = 'solana'
              AND LOWER(iw.wallet_address) = LOWER(${wallet})
            LIMIT 1
          ),
          'wallet:' || ${wallet}
        ) AS scope_key
      ),
      wallet_points AS (
        SELECT
          wallet_address,
          COALESCE(SUM(points), 0)::float AS core_point
        FROM corepoint_events
        GROUP BY wallet_address
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
          COALESCE(SUM(core_point), 0)::float AS core_point
        FROM scoped
        GROUP BY scope_key
        HAVING COALESCE(SUM(core_point), 0) > 0
      ),
      ranked AS (
        SELECT
          scope_key,
          identity_id,
          core_point,
          RANK() OVER (ORDER BY core_point DESC) AS rank
        FROM identity_totals
      )
      SELECT
        r.rank,
        r.core_point,
        r.identity_id
      FROM ranked r
      JOIN target_scope ts
        ON ts.scope_key = r.scope_key
      LIMIT 1;
    `;

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        rank: null,
        core_point: 0,
        identity_id: null,
      });
    }

    return NextResponse.json({
      success: true,
      rank: rows[0].rank,
      core_point: rows[0].core_point,
      identity_id: rows[0].identity_id ?? null,
    });
  } catch (err) {
    console.error('Rank fetch error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}