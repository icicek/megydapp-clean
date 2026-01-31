// app/api/phases/list/route.ts
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

export async function GET(_req: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    /**
     * We compute BOTH:
     * 1) Window (time) totals: contributions within [opened_at, closed_at) (active => closed_at is null => NOW())
     * 2) Forecast (capacity) totals: cumulative target fill across phases (splits contributions virtually)
     *
     * Output mapping:
     * - used_usd/fill_pct/alloc_*      => Window (live)
     * - used_usd_forecast/...         => Forecast
     */

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
      ),

      -- Eligible contributions (same rules for both models)
      eligible_contributions AS (
        SELECT
          c.id AS contribution_id,
          c.wallet_address,
          COALESCE(c.usd_value, 0)::numeric AS usd_value,
          c.token_contract,
          COALESCE(c.network,'solana') AS network,
          COALESCE(c.alloc_status,'pending') AS alloc_status,
          c.timestamp
        FROM contributions c
        WHERE COALESCE(c.usd_value,0)::numeric > 0
          AND COALESCE(c.network,'solana') = 'solana'
          AND COALESCE(c.alloc_status,'pending') <> 'invalid'
      ),

      -- Window totals per phase
      phase_window_totals AS (
        SELECT
          p.id AS phase_id,
          COALESCE(SUM(ec.usd_value),0)::numeric AS used_usd_window,
          COUNT(ec.contribution_id)::int AS alloc_rows_window,
          COUNT(DISTINCT ec.wallet_address)::int AS alloc_wallets_window
        FROM phases_sorted p
        LEFT JOIN eligible_contributions ec
          ON p.opened_at IS NOT NULL
         AND ec.timestamp >= p.opened_at
         AND ec.timestamp < COALESCE(p.closed_at, NOW())
        GROUP BY p.id
      ),

      -- Running totals for Forecast splitting
      contrib_running AS (
        SELECT
          ec.*,
          (SUM(ec.usd_value) OVER (ORDER BY ec.timestamp ASC, ec.contribution_id ASC) - ec.usd_value) AS rt_prev,
          SUM(ec.usd_value) OVER (ORDER BY ec.timestamp ASC, ec.contribution_id ASC) AS rt
        FROM eligible_contributions ec
      ),

      -- Virtual split of contributions across phases by cumulative targets
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
      )

      SELECT
        ps.*,

        -- Window (live)
        COALESCE(pwt.used_usd_window, 0)::numeric AS used_usd_window,
        COALESCE(pwt.alloc_wallets_window, 0)::int AS alloc_wallets_window,
        COALESCE(pwt.alloc_rows_window, 0)::int AS alloc_rows_window,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(pwt.used_usd_window, 0)::numeric / COALESCE(ps.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct_window,

        -- Forecast (capacity)
        COALESCE(pvt.used_usd_forecast, 0)::numeric AS used_usd_forecast,
        COALESCE(pvt.alloc_wallets_forecast, 0)::int AS alloc_wallets_forecast,
        COALESCE(pvt.alloc_rows_forecast, 0)::int AS alloc_rows_forecast,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(pvt.used_usd_forecast, 0)::numeric / COALESCE(ps.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct_forecast

      FROM phases_sorted ps
      LEFT JOIN phase_window_totals  pwt ON pwt.phase_id = ps.id
      LEFT JOIN phase_virtual_totals pvt ON pvt.phase_id = ps.id
      ORDER BY ps.phase_no ASC, ps.id ASC;
    `;

    // Simple debug: global eligible contributions summary
    const debug = await sql`
      SELECT
        COUNT(*)::int AS eligible_rows,
        COALESCE(SUM(COALESCE(usd_value,0)::numeric),0)::numeric AS eligible_usd_sum,
        MIN(timestamp) AS first_ts,
        MAX(timestamp) AS last_ts
      FROM contributions
      WHERE COALESCE(usd_value,0)::numeric > 0
        AND COALESCE(network,'solana') = 'solana'
        AND COALESCE(alloc_status,'pending') <> 'invalid';
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

        // Window (live) => primary
        used_usd: pickFirst(r, ['used_usd_window'], 0),
        fill_pct: pickFirst(r, ['fill_pct_window'], 0),
        alloc_wallets: pickFirst(r, ['alloc_wallets_window'], 0),
        alloc_rows: pickFirst(r, ['alloc_rows_window'], 0),

        // Forecast (capacity) => extra
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

    return NextResponse.json({
      success: true,
      phases,
      debug: (debug as AnyRow[])?.[0] ?? null,
    });
  } catch (e: any) {
    console.error('GET /api/phases/list failed:', e);
    return NextResponse.json(
      { success: false, error: 'PHASES_LIST_FAILED', detail: String(e?.message || e) },
      { status: 500 }
    );
  }  
}
