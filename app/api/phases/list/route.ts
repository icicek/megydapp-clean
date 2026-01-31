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

    // ✅ Live progress = phase time window based
    const rows = await sql`
      WITH base AS (
        SELECT
          p.*,
          COALESCE(p.target_usd, 0)::numeric AS target_usd_num
        FROM phases p
      ),
      agg AS (
        SELECT
          b.id AS phase_id,

          COALESCE(SUM(
            CASE
              WHEN b.opened_at IS NULL THEN 0
              WHEN c.timestamp < b.opened_at THEN 0
              WHEN b.closed_at IS NOT NULL AND c.timestamp >= b.closed_at THEN 0
              ELSE COALESCE(c.usd_value,0)::numeric
            END
          ), 0)::numeric AS used_usd,

          COALESCE(COUNT(*) FILTER (
            WHERE b.opened_at IS NOT NULL
              AND c.timestamp >= b.opened_at
              AND (b.closed_at IS NULL OR c.timestamp < b.closed_at)
              AND COALESCE(c.usd_value,0)::numeric > 0
              AND COALESCE(c.alloc_status,'pending') <> 'invalid'
              AND COALESCE(c.network,'solana') = 'solana'
          ), 0)::int AS alloc_rows,

          COALESCE(COUNT(DISTINCT c.wallet_address) FILTER (
            WHERE b.opened_at IS NOT NULL
              AND c.timestamp >= b.opened_at
              AND (b.closed_at IS NULL OR c.timestamp < b.closed_at)
              AND COALESCE(c.usd_value,0)::numeric > 0
              AND COALESCE(c.alloc_status,'pending') <> 'invalid'
              AND COALESCE(c.network,'solana') = 'solana'
          ), 0)::int AS alloc_wallets

        FROM base b
        LEFT JOIN contributions c
          ON COALESCE(c.network,'solana') = 'solana'
         AND COALESCE(c.alloc_status,'pending') <> 'invalid'
         AND COALESCE(c.usd_value,0)::numeric > 0
        GROUP BY b.id
      )
      SELECT
        b.*,
        COALESCE(a.used_usd, 0)::numeric AS used_usd,
        COALESCE(a.alloc_wallets, 0)::int AS alloc_wallets,
        COALESCE(a.alloc_rows, 0)::int AS alloc_rows,
        CASE
          WHEN COALESCE(b.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(a.used_usd, 0)::numeric / COALESCE(b.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct
      FROM base b
      LEFT JOIN agg a ON a.phase_id = b.id
      ORDER BY b.phase_no ASC, b.id ASC;
    `;

    // Debug: overall sanity + active window sanity
    const debugRows = await sql`
      SELECT
        ps.*,

        -- Forecast (capacity)
        COALESCE(pvt.used_usd, 0)::numeric AS used_usd_forecast,
        COALESCE(pvt.alloc_wallets, 0)::int AS alloc_wallets_forecast,
        COALESCE(pvt.alloc_rows, 0)::int AS alloc_rows_forecast,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(pvt.used_usd, 0)::numeric / COALESCE(ps.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct_forecast,

        -- Window (time)
        COALESCE(pwt.used_usd_window, 0)::numeric AS used_usd_window,
        COALESCE(pwt.alloc_wallets_window, 0)::int AS alloc_wallets_window,
        COALESCE(pwt.alloc_rows_window, 0)::int AS alloc_rows_window,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(pwt.used_usd_window, 0)::numeric / COALESCE(ps.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct_window

      FROM phases_sorted ps
      , phase_window_totals AS (
        SELECT
          p.id AS phase_id,
          COALESCE(SUM(c.usd_value),0)::numeric AS used_usd_window,
          COUNT(*)::int AS alloc_rows_window,
          COUNT(DISTINCT c.wallet_address)::int AS alloc_wallets_window
        FROM phases p
        LEFT JOIN contributions c
          ON COALESCE(c.usd_value,0)::numeric > 0
        AND COALESCE(c.network,'solana') = 'solana'
        AND COALESCE(c.alloc_status,'pending') <> 'invalid'
        AND c.timestamp >= p.opened_at
        AND c.timestamp < COALESCE(p.closed_at, NOW())
        GROUP BY p.id
      )
      LEFT JOIN phase_virtual_totals pvt ON pvt.phase_id = ps.id
      LEFT JOIN phase_window_totals  pwt ON pwt.phase_id = ps.id
      ORDER BY ps.phase_no ASC, ps.id ASC;
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

        // window => primary live
        used_usd: pickFirst(r, ['used_usd_window'], 0),
        fill_pct: pickFirst(r, ['fill_pct_window'], 0),
        alloc_wallets: pickFirst(r, ['alloc_wallets_window'], 0),
        alloc_rows: pickFirst(r, ['alloc_rows_window'], 0),

        // forecast => extra
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
      debug: (debugRows as AnyRow[])?.[0] ?? null,
    });
  } catch (e) {
    console.error('GET /api/phases/list failed:', e);
    return NextResponse.json({ success: false, error: 'PHASES_LIST_FAILED' }, { status: 500 });
  }
}