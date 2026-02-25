export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

type AnyRow = Record<string, any>;

function asNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pickFirst(row: AnyRow, keys: string[], fallback: any = null) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return fallback;
}

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export async function GET(_req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

    const rows = await sql`
      WITH phases_sorted AS (
        SELECT
          p.*,
          COALESCE(
            p.target_usd,
            (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
            0
          )::numeric AS target_usd_num,
          SUM(
            COALESCE(
              p.target_usd,
              (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
              0
            )::numeric
          ) OVER (ORDER BY p.phase_no ASC, p.id ASC) AS cum_target,
          (
            SUM(
              COALESCE(
                p.target_usd,
                (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
                0
              )::numeric
            ) OVER (ORDER BY p.phase_no ASC, p.id ASC)
            - COALESCE(
                p.target_usd,
                (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
                0
              )::numeric
          ) AS cum_prev
        FROM phases p
        WHERE p.snapshot_taken_at IS NULL
      ),

      eligible_contributions AS (
        SELECT
          c.id AS contribution_id,
          c.phase_id,
          c.wallet_address,
          COALESCE(c.usd_value, 0)::numeric AS usd_value,
          c.token_contract,
          COALESCE(c.network,'solana') AS network,
          COALESCE(c.alloc_status,'pending') AS alloc_status,
          c.timestamp
        FROM contributions c
        LEFT JOIN token_registry tr ON tr.mint = c.token_contract
        WHERE COALESCE(c.usd_value,0)::numeric > 0
          AND COALESCE(c.network,'solana') = 'solana'
          AND COALESCE(c.alloc_status,'pending') <> 'invalid'
          AND (
            c.token_contract IS NULL
            OR c.token_contract = ${WSOL_MINT}
            OR (tr.mint IS NOT NULL AND tr.status IN ('healthy','walking_dead'))
          )
      ),

      -- ✅ Allocations truth (economic truth)
      phase_alloc_totals AS (
        SELECT
          pa.phase_id,
          COALESCE(SUM(pa.usd_allocated),0)::numeric AS used_usd_alloc,
          COUNT(*)::int AS alloc_rows_alloc,
          COUNT(DISTINCT pa.wallet_address)::int AS alloc_wallets_alloc
        FROM phase_allocations pa
        GROUP BY pa.phase_id
      ),

      -- Forecast splitting (optional, preserved)
      contrib_running AS (
        SELECT
          ec.*,
          (SUM(ec.usd_value) OVER (ORDER BY ec.timestamp ASC, ec.contribution_id ASC) - ec.usd_value) AS rt_prev,
          SUM(ec.usd_value) OVER (ORDER BY ec.timestamp ASC, ec.contribution_id ASC) AS rt
        FROM eligible_contributions ec
      ),

      contrib_to_phase AS (
        SELECT
          ps.id AS phase_id,
          cr.contribution_id,
          cr.wallet_address,
          GREATEST(
            0,
            LEAST(cr.rt, ps.cum_target) - GREATEST(cr.rt_prev, ps.cum_prev)
          )::numeric AS usd_allocated_virtual
        FROM contrib_running cr
        JOIN phases_sorted ps
          ON cr.rt > ps.cum_prev
         AND cr.rt_prev < ps.cum_target
      ),

      phase_virtual_totals AS (
        SELECT
          phase_id,
          COALESCE(SUM(usd_allocated_virtual),0)::numeric AS used_usd_forecast,
          COUNT(*)::int AS alloc_rows_forecast,
          COUNT(DISTINCT wallet_address)::int AS alloc_wallets_forecast
        FROM contrib_to_phase
        WHERE usd_allocated_virtual > 0
        GROUP BY phase_id
      ),

      debug_summary AS (
        SELECT
          COUNT(*)::int AS eligible_rows,
          COALESCE(SUM(usd_value),0)::numeric AS eligible_usd_sum,
          MIN(timestamp) AS first_ts,
          MAX(timestamp) AS last_ts
        FROM eligible_contributions
      ),

      queue_summary AS (
        SELECT
          COALESCE(SUM(COALESCE(usd_value,0)),0)::numeric AS queue_usd
        FROM eligible_contributions
        WHERE phase_id IS NULL
          AND COALESCE(alloc_status,'unassigned') IN ('unassigned','pending')
      )

      SELECT
        ps.*,

        -- ✅ Allocations truth => primary
        COALESCE(pat.used_usd_alloc, 0)::numeric AS used_usd_alloc,
        COALESCE(pat.alloc_wallets_alloc, 0)::int AS alloc_wallets_alloc,
        COALESCE(pat.alloc_rows_alloc, 0)::int AS alloc_rows_alloc,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(pat.used_usd_alloc, 0)::numeric / COALESCE(ps.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct_alloc,

        -- Forecast (kept)
        COALESCE(pvt.used_usd_forecast, 0)::numeric AS used_usd_forecast,
        COALESCE(pvt.alloc_wallets_forecast, 0)::int AS alloc_wallets_forecast,
        COALESCE(pvt.alloc_rows_forecast, 0)::int AS alloc_rows_forecast,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(pvt.used_usd_forecast, 0)::numeric / COALESCE(ps.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct_forecast

      FROM phases_sorted ps
      LEFT JOIN phase_alloc_totals  pat ON pat.phase_id = ps.id
      LEFT JOIN phase_virtual_totals pvt ON pvt.phase_id = ps.id
      ORDER BY ps.phase_no ASC, ps.id ASC;
    `;

    const debug = await sql`
      SELECT
        COUNT(*)::int AS eligible_rows,
        COALESCE(SUM(COALESCE(c.usd_value,0)::numeric),0)::numeric AS eligible_usd_sum,
        MIN(c.timestamp) AS first_ts,
        MAX(c.timestamp) AS last_ts
      FROM contributions c
      LEFT JOIN token_registry tr ON tr.mint = c.token_contract
      WHERE COALESCE(c.usd_value,0)::numeric > 0
        AND COALESCE(c.network,'solana') = 'solana'
        AND COALESCE(c.alloc_status,'pending') <> 'invalid'
        AND (
          c.token_contract IS NULL
          OR c.token_contract = ${WSOL_MINT}
          OR (tr.mint IS NOT NULL AND tr.status IN ('healthy','walking_dead'))
        );
    `;

    const queue = await sql`
      SELECT
        COALESCE(SUM(COALESCE(c.usd_value,0)::numeric),0)::numeric AS queue_usd
      FROM contributions c
      LEFT JOIN token_registry tr ON tr.mint = c.token_contract
      WHERE c.phase_id IS NULL
        AND COALESCE(c.alloc_status,'unassigned') IN ('unassigned','pending')
        AND COALESCE(c.network,'solana') = 'solana'
        AND COALESCE(c.usd_value,0)::numeric > 0
        AND COALESCE(c.alloc_status,'pending') <> 'invalid'
        AND (
          c.token_contract IS NULL
          OR c.token_contract = ${WSOL_MINT}
          OR (tr.mint IS NOT NULL AND tr.status IN ('healthy','walking_dead'))
        );
    `;

    const phases = (rows as AnyRow[]).map((r) => {
      const id = asNumber(pickFirst(r, ['id', 'phase_id', 'phaseId'])) ?? 0;

      const rateRaw = pickFirst(r, ['rate_usd_per_megy', 'rate'], null);
      const rateNum = rateRaw === '' ? null : asNumber(rateRaw);

      return {
        phase_id: id,
        phase_no: asNumber(pickFirst(r, ['phase_no', 'phaseNo'])) ?? id,
        name: String(pickFirst(r, ['name'], '') ?? ''),
        status: String(pickFirst(r, ['status', 'status_v2'], '') ?? ''),
        pool_megy: pickFirst(r, ['pool_megy', 'megy_pool'], null),
        rate_usd_per_megy: rateNum,
        target_usd: pickFirst(r, ['target_usd', 'usd_cap'], null),

        // ✅ Allocations truth => primary
        used_usd: pickFirst(r, ['used_usd_alloc'], 0),
        fill_pct: pickFirst(r, ['fill_pct_alloc'], 0),
        alloc_wallets: pickFirst(r, ['alloc_wallets_alloc'], 0),
        alloc_rows: pickFirst(r, ['alloc_rows_alloc'], 0),

        // Forecast (kept)
        used_usd_forecast: pickFirst(r, ['used_usd_forecast'], 0),
        fill_pct_forecast: pickFirst(r, ['fill_pct_forecast'], 0),
        alloc_wallets_forecast: pickFirst(r, ['alloc_wallets_forecast'], 0),
        alloc_rows_forecast: pickFirst(r, ['alloc_rows_forecast'], 0),

        opened_at: pickFirst(r, ['opened_at'], null),
        closed_at: pickFirst(r, ['closed_at'], null),
        snapshot_taken_at: pickFirst(r, ['snapshot_taken_at'], null),
        finalized_at: pickFirst(r, ['finalized_at'], null),
        created_at: pickFirst(r, ['created_at'], null),
        updated_at: pickFirst(r, ['updated_at'], null),
      };
    });

    const activeNow = await sql`
      SELECT id, phase_no
      FROM phases
      WHERE status = 'active'
        AND snapshot_taken_at IS NULL
      ORDER BY phase_no ASC, id ASC
      LIMIT 1;
    `;
    const an = (activeNow as any[])?.[0] ?? null;

    return NextResponse.json({
      success: true,
      current_active_phase_id: an?.id ? Number(an.id) : null,
      current_active_phase_no: an?.phase_no ? Number(an.phase_no) : null,
      phases,
      queue: (queue as any[])?.[0] ?? { queue_usd: 0 },
      debug: (debug as any[])?.[0] ?? null,
    });
  } catch (e: any) {
    console.error('GET /api/phases/list failed:', e);
    return NextResponse.json(
      { success: false, error: 'PHASES_LIST_FAILED', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}