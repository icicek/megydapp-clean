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

    const sortSql =
      sort === 'usd'
        ? sql`agg.total_revived_usd DESC NULLS LAST, agg.last_activity_at DESC NULLS LAST`
        : sort === 'wallets'
          ? sql`agg.unique_wallets DESC NULLS LAST, agg.last_activity_at DESC NULLS LAST`
          : sort === 'coincarnations'
            ? sql`agg.total_coincarnations DESC NULLS LAST, agg.last_activity_at DESC NULLS LAST`
            : sql`agg.last_activity_at DESC NULLS LAST, agg.recent_24h_count DESC NULLS LAST`;

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
          MAX(vc.timestamp) AS last_activity_at,
          COUNT(*) FILTER (
            WHERE vc.timestamp >= NOW() - INTERVAL '24 hours'
          )::int AS recent_24h_count,
          COUNT(*) FILTER (
            WHERE vc.timestamp >= NOW() - INTERVAL '10 minutes'
          )::int AS recent_10m_count
        FROM valid_contributions vc
        GROUP BY vc.token_contract
      )
      SELECT
        agg.mint,
        COALESCE(mc.symbol, NULLIF(MAX(vc.token_symbol), ''), null) AS symbol,
        COALESCE(mc.name, null) AS name,
        COALESCE(mc.logo_uri, null) AS logo_uri,

        COALESCE(r.status::text, 'deadcoin') AS status,

        agg.total_coincarnations,
        agg.unique_wallets,
        agg.total_revived_usd::float8 AS total_revived_usd,
        agg.last_activity_at,
        agg.recent_24h_count,
        agg.recent_10m_count,

        CASE
          WHEN agg.recent_10m_count >= 5 THEN 'HOT'
          WHEN agg.recent_10m_count >= 2 THEN 'TRENDING'
          WHEN agg.recent_24h_count >= 1 THEN 'LIVE'
          ELSE null
        END AS heat_level

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
        agg.last_activity_at,
        agg.recent_24h_count,
        agg.recent_10m_count
      ORDER BY
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
      last_activity_at: string | null;
      recent_24h_count: number;
      recent_10m_count: number;
      heat_level: 'HOT' | 'TRENDING' | 'LIVE' | null;
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
          vc.token_contract AS mint,
          MAX(vc.timestamp) AS last_activity_at
        FROM valid_contributions vc
        GROUP BY vc.token_contract
      )
      SELECT COUNT(*)::int AS total
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