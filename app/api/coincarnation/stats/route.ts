// app/api/coincarnation/stats/route.ts
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

import {
  getDatabaseUrl,
} from '@/app/api/_lib/database-url';

export const revalidate = 30;
export const runtime = 'nodejs';

function getSql() {
  return neon(
    getDatabaseUrl()
  );
}

export async function GET() {
  try {
    const sql = getSql();

    /*
     * Aggregate contribution statistics entirely inside PostgreSQL.
     *
     * Important semantics preserved from the previous implementation:
     *
     * - usd_value = 0 is excluded from totalUsd.
     * - A contribution is excluded from totalUsd only when its
     *   registry status is explicitly "deadcoin".
     * - Missing registry rows remain eligible, matching the previous
     *   getStatusRow() fallback behavior.
     * - blacklist/redlist contributions remain eligible here because
     *   the previous implementation excluded only "deadcoin".
     *
     * The LEFT JOIN removes the previous N-query status lookup pattern
     * and prevents all contribution rows from being transferred to
     * the application server.
     */
    const contributionStatsResult = await sql`
      SELECT
        COUNT(DISTINCT c.wallet_address)::int
          AS total_participants,

        COALESCE(
          SUM(
            CASE
              WHEN
                COALESCE(c.usd_value, 0) <> 0
                AND r.status IS DISTINCT FROM 'deadcoin'::token_status_enum
              THEN c.usd_value
              ELSE 0
            END
          ),
          0
        )::numeric
          AS total_usd,

        COUNT(
          DISTINCT c.token_contract
        ) FILTER (
          WHERE
            c.token_contract IS NOT NULL
            AND r.status = 'deadcoin'::token_status_enum
        )::int
          AS unique_deadcoins

      FROM contributions c

      LEFT JOIN token_registry r
        ON r.mint = c.token_contract
    ` as any[];

    /*
     * Find the most frequently contributed deadcoin.
     *
     * Keeping this as a separate aggregate query makes the intent
     * explicit and avoids mixing ranking/window logic into the main
     * contribution aggregate.
     */
    const popularDeadcoinResult = await sql`
      SELECT
        c.token_symbol,
        COUNT(*)::int AS contribution_count

      FROM contributions c

      JOIN token_registry r
        ON r.mint = c.token_contract
       AND r.status = 'deadcoin'::token_status_enum

      WHERE
        c.token_contract IS NOT NULL
        AND c.token_symbol IS NOT NULL

      GROUP BY
        c.token_symbol,
        c.token_contract

      ORDER BY
        contribution_count DESC,
        c.token_contract ASC

      LIMIT 1
    ` as any[];

    /*
     * CorePoints are append-only event values, so SUM(points)
     * remains the canonical generated total.
     */
    const corePointResult = await sql`
      SELECT
        COALESCE(SUM(points), 0)::numeric AS total
      FROM corepoint_events
    ` as any[];

    /*
     * MEGY generated/allocated across all phase allocations.
     */
    const megyAllocatedResult = await sql`
      SELECT
        COALESCE(SUM(megy_allocated), 0)::numeric AS total
      FROM phase_allocations
    ` as any[];

    /*
     * Registry counters are calculated in one scan.
     */
    const registryStatsResult = await sql`
      SELECT
        COUNT(*) FILTER (
          WHERE status IN (
            'healthy',
            'walking_dead',
            'deadcoin'
          )
        )::int AS total_indexed_assets,

        COUNT(*) FILTER (
          WHERE status = 'healthy'
        )::int AS healthy_assets,

        COUNT(*) FILTER (
          WHERE status = 'walking_dead'
        )::int AS walking_dead_assets,

        COUNT(*) FILTER (
          WHERE status = 'deadcoin'
        )::int AS deadcoin_assets

      FROM token_registry
    ` as any[];

    const contributionStats =
      contributionStatsResult[0];

    const registryStats =
      registryStatsResult[0];

    const totalParticipants = Number(
      contributionStats?.total_participants ?? 0
    );

    const totalUsd = Number(
      contributionStats?.total_usd ?? 0
    );

    const uniqueDeadcoins = Number(
      contributionStats?.unique_deadcoins ?? 0
    );

    const mostPopularDeadcoin =
      popularDeadcoinResult[0]?.token_symbol
        ? String(
            popularDeadcoinResult[0].token_symbol
          )
        : 'No deadcoin yet';

    const corePointGenerated = Number(
      corePointResult[0]?.total ?? 0
    );

    const megyGenerated = Number(
      megyAllocatedResult[0]?.total ?? 0
    );

    const totalIndexedAssets = Number(
      registryStats?.total_indexed_assets ?? 0
    );

    const healthyAssets = Number(
      registryStats?.healthy_assets ?? 0
    );

    const walkingDeadAssets = Number(
      registryStats?.walking_dead_assets ?? 0
    );

    const deadcoinAssets = Number(
      registryStats?.deadcoin_assets ?? 0
    );

    const res = NextResponse.json({
      success: true,

      // canonical fields
      totalParticipants,
      totalUsd,
      uniqueDeadcoins,
      mostPopularDeadcoin,
      corePointGenerated,
      megyGenerated,
      totalIndexedAssets,
      healthyAssets,
      walkingDeadAssets,
      deadcoinAssets,

      // backward-compatible aliases
      participantCount: totalParticipants,
      totalUsdValue: totalUsd,
    });

    res.headers.set(
      'Cache-Control',
      's-maxage=15, stale-while-revalidate=60'
    );

    return res;
  } catch (error) {
    console.error(
      '[STATS API ERROR]',
      error
    );

    const res = NextResponse.json(
      {
        success: true,
        degraded: true,

        totalParticipants: 0,
        totalUsd: 0,
        uniqueDeadcoins: 0,
        mostPopularDeadcoin:
          'No deadcoin yet',
        corePointGenerated: 0,
        megyGenerated: 0,
        totalIndexedAssets: 0,
        healthyAssets: 0,
        walkingDeadAssets: 0,
        deadcoinAssets: 0,

        participantCount: 0,
        totalUsdValue: 0,
      },
      { status: 200 }
    );

    res.headers.set(
      'Cache-Control',
      's-maxage=15, stale-while-revalidate=60'
    );

    return res;
  }
}