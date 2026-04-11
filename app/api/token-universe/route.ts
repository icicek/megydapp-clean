//app/api/token-universe/route.ts
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

function toInt(v: string | null, d: number) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
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

    const limit = Math.min(Math.max(toInt(searchParams.get('limit'), 20), 1), 100);
    const offset = Math.max(toInt(searchParams.get('offset'), 0), 0);

    const pattern = q ? `%${q}%` : null;

    const items = (await sql`
      SELECT
        r.mint,
        r.status::text AS status,
        r.status_at,
        r.updated_by,
        r.reason,
        r.created_at,
        r.updated_at,
        COALESCE(mc.symbol, null) AS symbol,
        COALESCE(mc.name, null) AS name,
        COALESCE(mc.logo_uri, null) AS logo_uri,
        COALESCE(mc.source, null) AS metadata_source,
        CASE
          WHEN ${q ?? null}::text IS NULL THEN 100
          WHEN LOWER(r.mint) = LOWER(${q}) THEN 1
          WHEN LOWER(COALESCE(mc.symbol, '')) = LOWER(${q}) THEN 2
          WHEN LOWER(COALESCE(mc.name, '')) = LOWER(${q}) THEN 3
          WHEN r.mint ILIKE ${pattern} THEN 4
          WHEN COALESCE(mc.symbol, '') ILIKE ${pattern} THEN 5
          WHEN COALESCE(mc.name, '') ILIKE ${pattern} THEN 6
          ELSE 100
        END AS match_rank
      FROM token_registry r
      LEFT JOIN token_metadata_cache mc
        ON mc.mint = r.mint
      WHERE
        (${status ?? null}::text IS NULL OR r.status::text = ${status})
        AND (
          (${pattern ?? null}::text IS NULL)
          OR r.mint ILIKE ${pattern}
          OR COALESCE(mc.symbol, '') ILIKE ${pattern}
          OR COALESCE(mc.name, '') ILIKE ${pattern}
        )
      ORDER BY
        CASE
          WHEN ${q ?? null}::text IS NULL THEN 100
          WHEN LOWER(r.mint) = LOWER(${q}) THEN 1
          WHEN LOWER(COALESCE(mc.symbol, '')) = LOWER(${q}) THEN 2
          WHEN LOWER(COALESCE(mc.name, '')) = LOWER(${q}) THEN 3
          WHEN r.mint ILIKE ${pattern} THEN 4
          WHEN COALESCE(mc.symbol, '') ILIKE ${pattern} THEN 5
          WHEN COALESCE(mc.name, '') ILIKE ${pattern} THEN 6
          ELSE 100
        END ASC,
        r.updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as Array<{
      mint: string;
      status: TokenStatus;
      status_at: string | null;
      updated_by: string | null;
      reason: string | null;
      created_at: string;
      updated_at: string;
      symbol: string | null;
      name: string | null;
      logo_uri: string | null;
      metadata_source: string | null;
      match_rank: number;
    }>;

    const totalRows = (await sql`
      SELECT COUNT(*)::int AS total
      FROM token_registry r
      LEFT JOIN token_metadata_cache mc
        ON mc.mint = r.mint
      WHERE
        (${status ?? null}::text IS NULL OR r.status::text = ${status})
        AND (
          (${pattern ?? null}::text IS NULL)
          OR r.mint ILIKE ${pattern}
          OR COALESCE(mc.symbol, '') ILIKE ${pattern}
          OR COALESCE(mc.name, '') ILIKE ${pattern}
        )
    `) as unknown as Array<{ total: number }>;

    return NextResponse.json({
      success: true,
      items,
      total: totalRows[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}