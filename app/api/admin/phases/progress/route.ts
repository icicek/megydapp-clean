export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    const rows = (await sql/* sql */`
      WITH phase_base AS (
        SELECT
          p.id AS phase_id,
          p.phase_no,
          p.name,
          p.status,
          p.opened_at,
          p.closed_at,
          p.snapshot_taken_at,
          p.finalized_at,
          COALESCE(
            p.target_usd,
            p.usd_cap,
            (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
            (COALESCE(p.megy_pool,0)::numeric * COALESCE(p.rate,0)::numeric),
            0
          )::numeric AS target_usd
        FROM phases p
      ),
      alloc_totals AS (
        SELECT
          pa.phase_id,
          COALESCE(SUM(COALESCE(pa.usd_allocated,0)::numeric),0)::numeric AS alloc_usd_sum,
          COALESCE(SUM(COALESCE(pa.megy_allocated,0)::numeric),0)::numeric AS alloc_megy_sum,
          COUNT(*)::int AS alloc_rows,
          COUNT(DISTINCT pa.wallet_address)::int AS alloc_wallets
        FROM phase_allocations pa
        GROUP BY pa.phase_id
      ),
      queue_totals AS (
        SELECT
          COALESCE(SUM(COALESCE(c.usd_value,0)::numeric),0)::numeric AS queue_usd,
          COUNT(*)::int AS queue_rows,
          COUNT(DISTINCT c.wallet_address)::int AS queue_wallets
        FROM contributions c
        LEFT JOIN token_registry tr ON tr.mint = c.token_contract
        WHERE c.phase_id IS NULL
          AND COALESCE(c.alloc_status,'unassigned') IN ('unassigned','partial','pending')
          AND COALESCE(c.network,'solana') = 'solana'
          AND COALESCE(c.usd_value,0)::numeric > 0
          AND (
            c.token_contract IS NULL
            OR c.token_contract = ${WSOL_MINT}
            OR (tr.mint IS NOT NULL AND tr.status IN ('healthy','walking_dead'))
          )
      )
      SELECT
        pb.phase_id,
        pb.phase_no,
        pb.name,
        pb.status,
        pb.opened_at,
        pb.closed_at,
        pb.snapshot_taken_at,
        pb.finalized_at,
        pb.target_usd,

        COALESCE(at.alloc_usd_sum, 0)::numeric AS alloc_usd_sum,
        COALESCE(at.alloc_megy_sum, 0)::numeric AS alloc_megy_sum,
        COALESCE(at.alloc_rows, 0)::int AS alloc_rows,
        COALESCE(at.alloc_wallets, 0)::int AS alloc_wallets,

        -- modern progress truth
        COALESCE(at.alloc_usd_sum, 0)::numeric AS used_usd,
        COALESCE(at.alloc_rows, 0)::int AS used_rows,
        COALESCE(at.alloc_wallets, 0)::int AS used_wallets,

        -- forecast = current allocation truth (same source)
        COALESCE(at.alloc_usd_sum, 0)::numeric AS used_usd_forecast,
        COALESCE(at.alloc_rows, 0)::int AS alloc_rows_forecast,
        COALESCE(at.alloc_wallets, 0)::int AS alloc_wallets_forecast,

        CASE
          WHEN COALESCE(pb.target_usd,0)::numeric > 0
          THEN (COALESCE(at.alloc_usd_sum,0)::numeric / COALESCE(pb.target_usd,0)::numeric)
          ELSE 0
        END AS fill_pct,

        qt.queue_usd,
        qt.queue_rows,
        qt.queue_wallets
      FROM phase_base pb
      LEFT JOIN alloc_totals at ON at.phase_id = pb.phase_id
      CROSS JOIN queue_totals qt
      ORDER BY pb.phase_no ASC, pb.phase_id ASC
    `) as any[];

    return NextResponse.json({
      success: true,
      rows: rows ?? [],
    });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}