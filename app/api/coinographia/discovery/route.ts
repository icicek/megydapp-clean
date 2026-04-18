// app/api/coinographia/discovery/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = [
  'healthy',
  'walking_dead',
  'deadcoin',
  'redlist',
  'blacklist',
] as const;

type TokenStatus = typeof ALLOWED_STATUSES[number];
type SortKey = 'recent' | 'usd' | 'wallets' | 'coincarnations';

function toInt(v: string | null, d: number) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
}

function clampLimit(v: number) {
  return Math.min(Math.max(v, 1), 100);
}

function getSort(raw: string | null): SortKey {
  if (raw === 'usd') return 'usd';
  if (raw === 'wallets') return 'wallets';
  if (raw === 'coincarnations') return 'coincarnations';
  return 'recent';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const qRaw = searchParams.get('q');
    const q = qRaw?.trim() || null;

    const rawStatus = searchParams.get('status');
    const status =
      rawStatus && ALLOWED_STATUSES.includes(rawStatus as TokenStatus)
        ? (rawStatus as TokenStatus)
        : null;

    const sort = getSort(searchParams.get('sort'));
    const limit = clampLimit(toInt(searchParams.get('limit'), 24));
    const offset = Math.max(toInt(searchParams.get('offset'), 0), 0);

    const pattern = q ? `%${q}%` : null;
    const hasExactSearch = !!q;

    const sortSql =
      sort === 'usd'
        ? sql`is_search_pioneer DESC, total_revived_usd DESC NULLS LAST, last_activity_at DESC NULLS LAST`
        : sort === 'wallets'
          ? sql`is_search_pioneer DESC, unique_wallets DESC NULLS LAST, last_activity_at DESC NULLS LAST`
          : sort === 'coincarnations'
            ? sql`is_search_pioneer DESC, total_coincarnations DESC NULLS LAST, last_activity_at DESC NULLS LAST`
            : sql`is_search_pioneer DESC, activity_score DESC NULLS LAST, last_activity_at DESC NULLS LAST`;

    const items = (await sql`
      WITH valid_contributions AS (
        SELECT
          c.id,
          c.wallet_address,
          c.token_contract,
          c.token_symbol,
          c.usd_value,
          c.timestamp
        FROM contributions c
        WHERE
          c.network = 'solana'
          AND COALESCE(NULLIF(TRIM(c.token_contract), ''), '') <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM contribution_invalidations ci
            WHERE ci.contribution_id = c.id
          )
      ),

      agg AS (
        SELECT
          vc.token_contract AS mint,
          COUNT(*)::int AS total_coincarnations,
          COUNT(DISTINCT vc.wallet_address)::int AS unique_wallets,
          COALESCE(SUM(vc.usd_value), 0)::numeric AS total_revived_usd,
          MIN(vc.timestamp) AS first_seen_at,
          MAX(vc.timestamp) AS last_activity_at,
          COUNT(*) FILTER (
            WHERE vc.timestamp >= NOW() - INTERVAL '24 hours'
          )::int AS recent_24h_count,
          COUNT(*) FILTER (
            WHERE vc.timestamp >= NOW() - INTERVAL '10 minutes'
          )::int AS recent_10m_count,
          (
            COUNT(*) FILTER (WHERE vc.timestamp >= NOW() - INTERVAL '10 minutes') * 100
            + COUNT(*) FILTER (WHERE vc.timestamp >= NOW() - INTERVAL '24 hours') * 10
            + COUNT(DISTINCT vc.wallet_address) * 3
            + COUNT(*)
          )::int AS activity_score
        FROM valid_contributions vc
        GROUP BY vc.token_contract
      ),

      discovery_matches AS (
        SELECT
          agg.mint,
          COALESCE(mc.symbol, NULLIF(MAX(vc.token_symbol), ''), null) AS symbol,
          COALESCE(mc.name, null) AS name,
          COALESCE(mc.logo_uri, null) AS logo_uri,

          COALESCE(r.status::text, 'deadcoin') AS status,

          agg.total_coincarnations,
          agg.unique_wallets,
          agg.total_revived_usd::float8 AS total_revived_usd,
          agg.first_seen_at,
          agg.last_activity_at,
          agg.recent_24h_count,
          agg.recent_10m_count,
          agg.activity_score,

          CASE
            WHEN agg.recent_10m_count >= 5 THEN 'HOT'
            WHEN agg.recent_10m_count >= 2 THEN 'TRENDING'
            WHEN agg.recent_24h_count >= 1 THEN 'LIVE'
            ELSE null
          END AS heat_level,

          CASE
            WHEN ${sort}::text = 'usd' THEN 'highest_revived_usd'
            WHEN ${sort}::text = 'wallets' THEN 'most_wallets'
            WHEN ${sort}::text = 'coincarnations' THEN 'most_coincarnations'
            WHEN agg.recent_10m_count >= 5 THEN 'hot_now'
            WHEN agg.recent_10m_count >= 2 THEN 'trending_now'
            WHEN agg.recent_24h_count >= 1 THEN 'live_now'
            ELSE 'recent_cluster'
          END AS rank_reason,

          false AS is_search_pioneer,

          CASE
            WHEN ${q ?? null}::text IS NULL THEN 100
            WHEN LOWER(agg.mint) = LOWER(${q}) THEN 1
            WHEN LOWER(COALESCE(mc.symbol, '')) = LOWER(${q}) THEN 2
            WHEN LOWER(COALESCE(mc.name, '')) = LOWER(${q}) THEN 3
            WHEN agg.mint ILIKE ${pattern} THEN 4
            WHEN COALESCE(mc.symbol, '') ILIKE ${pattern} THEN 5
            WHEN COALESCE(mc.name, '') ILIKE ${pattern} THEN 6
            WHEN COALESCE(MAX(vc.token_symbol), '') ILIKE ${pattern} THEN 7
            ELSE 100
          END AS search_rank
        FROM agg
        LEFT JOIN token_registry r
          ON r.mint = agg.mint
        LEFT JOIN token_metadata_cache mc
          ON mc.mint = agg.mint
        LEFT JOIN valid_contributions vc
          ON vc.token_contract = agg.mint
        WHERE
          (${status ?? null}::text IS NULL OR COALESCE(r.status::text, 'deadcoin') = ${status})
          AND (
            (${pattern ?? null}::text IS NULL)
            OR agg.mint ILIKE ${pattern}
            OR COALESCE(mc.symbol, '') ILIKE ${pattern}
            OR COALESCE(mc.name, '') ILIKE ${pattern}
            OR COALESCE(vc.token_symbol, '') ILIKE ${pattern}
          )
        GROUP BY
          agg.mint,
          mc.symbol,
          mc.name,
          mc.logo_uri,
          r.status,
          agg.total_coincarnations,
          agg.unique_wallets,
          agg.total_revived_usd,
          agg.first_seen_at,
          agg.last_activity_at,
          agg.recent_24h_count,
          agg.recent_10m_count,
          agg.activity_score
      ),

      pioneer_candidate AS (
        SELECT
          r.mint,
          COALESCE(mc.symbol, null) AS symbol,
          COALESCE(mc.name, null) AS name,
          COALESCE(mc.logo_uri, null) AS logo_uri,
          r.status::text AS status,

          0::int AS total_coincarnations,
          0::int AS unique_wallets,
          0::float8 AS total_revived_usd,
          null::timestamp AS first_seen_at,
          null::timestamp AS last_activity_at,
          0::int AS recent_24h_count,
          0::int AS recent_10m_count,
          0::int AS activity_score,

          null::text AS heat_level,
          'search_pioneer'::text AS rank_reason,

          true AS is_search_pioneer,
          0 AS search_rank
        FROM token_registry r
        LEFT JOIN token_metadata_cache mc
          ON mc.mint = r.mint
        WHERE
          ${hasExactSearch}
          AND (${status ?? null}::text IS NULL OR r.status::text = ${status})
          AND (
            LOWER(r.mint) = LOWER(${q ?? ''})
            OR LOWER(COALESCE(mc.symbol, '')) = LOWER(${q ?? ''})
            OR LOWER(COALESCE(mc.name, '')) = LOWER(${q ?? ''})
          )
          AND NOT EXISTS (
            SELECT 1
            FROM agg
            WHERE agg.mint = r.mint
          )
        LIMIT 1
      ),

      combined AS (
        SELECT * FROM discovery_matches
        UNION ALL
        SELECT * FROM pioneer_candidate
      )

      SELECT
        mint,
        symbol,
        name,
        logo_uri,
        status,
        total_coincarnations,
        unique_wallets,
        total_revived_usd,
        first_seen_at,
        last_activity_at,
        recent_24h_count,
        recent_10m_count,
        activity_score,
        heat_level,
        rank_reason
      FROM combined
      ORDER BY
        search_rank ASC,
        ${sortSql}
      LIMIT ${limit}
      OFFSET ${offset}
    `) as unknown as Array<{
      mint: string;
      symbol: string | null;
      name: string | null;
      logo_uri: string | null;
      status: TokenStatus;
      total_coincarnations: number;
      unique_wallets: number;
      total_revived_usd: number;
      first_seen_at: string | null;
      last_activity_at: string | null;
      recent_24h_count: number;
      recent_10m_count: number;
      activity_score: number;
      heat_level: 'HOT' | 'TRENDING' | 'LIVE' | null;
      rank_reason:
        | 'highest_revived_usd'
        | 'most_wallets'
        | 'most_coincarnations'
        | 'hot_now'
        | 'trending_now'
        | 'live_now'
        | 'recent_cluster'
        | 'search_pioneer';
    }>;

    const totalRows = (await sql`
      WITH valid_contributions AS (
        SELECT
          c.id,
          c.wallet_address,
          c.token_contract,
          c.token_symbol,
          c.usd_value,
          c.timestamp
        FROM contributions c
        WHERE
          c.network = 'solana'
          AND COALESCE(NULLIF(TRIM(c.token_contract), ''), '') <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM contribution_invalidations ci
            WHERE ci.contribution_id = c.id
          )
      ),
      agg AS (
        SELECT
          vc.token_contract AS mint
        FROM valid_contributions vc
        GROUP BY vc.token_contract
      ),
      searchable AS (
        SELECT
          agg.mint,
          COALESCE(mc.symbol, NULLIF(sym.symbol, ''), null) AS symbol,
          COALESCE(mc.name, null) AS name
        FROM agg
        LEFT JOIN token_registry r
          ON r.mint = agg.mint
        LEFT JOIN token_metadata_cache mc
          ON mc.mint = agg.mint
        LEFT JOIN LATERAL (
          SELECT MAX(vc2.token_symbol) AS symbol
          FROM valid_contributions vc2
          WHERE vc2.token_contract = agg.mint
        ) sym ON true
        WHERE
          (${status ?? null}::text IS NULL OR COALESCE(r.status::text, 'deadcoin') = ${status})
      ),
      pioneer_count AS (
        SELECT COUNT(*)::int AS total
        FROM token_registry r
        LEFT JOIN token_metadata_cache mc
          ON mc.mint = r.mint
        WHERE
          ${hasExactSearch}
          AND (${status ?? null}::text IS NULL OR r.status::text = ${status})
          AND (
            LOWER(r.mint) = LOWER(${q ?? ''})
            OR LOWER(COALESCE(mc.symbol, '')) = LOWER(${q ?? ''})
            OR LOWER(COALESCE(mc.name, '')) = LOWER(${q ?? ''})
          )
          AND NOT EXISTS (
            SELECT 1
            FROM agg
            WHERE agg.mint = r.mint
          )
      )
      SELECT (
        (
          SELECT COUNT(*)::int
          FROM searchable
          WHERE
            (${pattern ?? null}::text IS NULL)
            OR mint ILIKE ${pattern}
            OR COALESCE(symbol, '') ILIKE ${pattern}
            OR COALESCE(name, '') ILIKE ${pattern}
        )
        +
        (SELECT total FROM pioneer_count)
      )::int AS total
    `) as unknown as Array<{ total: number }>;

    return NextResponse.json({
      success: true,
      items,
      total: totalRows[0]?.total ?? 0,
      limit,
      offset,
      sort,
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}