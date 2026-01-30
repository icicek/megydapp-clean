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
    const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

    // ✅ DEBUG: contributions healthcheck
    const dbg = await sql`
      SELECT
        COUNT(*)::int AS total_rows,
        COUNT(*) FILTER (WHERE COALESCE(usd_value,0)::numeric > 0)::int AS usd_pos_rows,
        COUNT(*) FILTER (WHERE COALESCE(alloc_status,'pending') <> 'invalid')::int AS not_invalid_rows,
        COUNT(*) FILTER (WHERE COALESCE(usd_value,0)::numeric > 0 AND COALESCE(alloc_status,'pending') <> 'invalid')::int AS eligible_rows,
        COALESCE(SUM(usd_value) FILTER (WHERE COALESCE(usd_value,0)::numeric > 0 AND COALESCE(alloc_status,'pending') <> 'invalid'), 0)::numeric AS eligible_usd_sum,
        MIN("timestamp") AS first_ts,
        MAX("timestamp") AS last_ts,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(network,'solana')) = 'solana')::int AS solana_rows,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(network,'solana')) <> 'solana')::int AS non_solana_rows
      FROM contributions;
    `;

    const rows = await sql`
      WITH phases_sorted AS (
        SELECT
          p.*,
          COALESCE(p.target_usd, 0)::numeric AS target_usd_num,
          SUM(COALESCE(p.target_usd,0)::numeric) OVER (ORDER BY p.phase_no ASC, p.id ASC) AS cum_target,
          (SUM(COALESCE(p.target_usd,0)::numeric) OVER (ORDER BY p.phase_no ASC, p.id ASC)
            - COALESCE(p.target_usd,0)::numeric) AS cum_prev
        FROM phases p
      ),
      eligible_contributions AS (
        SELECT
          c.id AS contribution_id,
          c.wallet_address,
          COALESCE(c.usd_value, 0)::numeric AS usd_value,
          c.token_contract,
          c.network,
          c."timestamp" AS ts
        FROM contributions c
        WHERE COALESCE(c.usd_value,0)::numeric > 0
          AND LOWER(COALESCE(c.network,'solana')) = 'solana'
          AND COALESCE(c.alloc_status,'pending') <> 'invalid'
      ),
      contrib_running AS (
        SELECT
          ec.*,
          (SUM(ec.usd_value) OVER (ORDER BY ec.ts ASC, ec.contribution_id ASC) - ec.usd_value) AS rt_prev,
          SUM(ec.usd_value) OVER (ORDER BY ec.ts ASC, ec.contribution_id ASC) AS rt
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
          COALESCE(SUM(usd_allocated_virtual),0)::numeric AS used_usd,
          COUNT(*)::int AS alloc_rows,
          COUNT(DISTINCT wallet_address)::int AS alloc_wallets
        FROM contrib_to_phase
        WHERE usd_allocated_virtual > 0
        GROUP BY phase_id
      )
      SELECT
        ps.*,
        COALESCE(pvt.used_usd, 0)::numeric AS used_usd,
        COALESCE(pvt.alloc_wallets, 0)::int AS alloc_wallets,
        COALESCE(pvt.alloc_rows, 0)::int AS alloc_rows,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(pvt.used_usd, 0)::numeric / COALESCE(ps.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct
      FROM phases_sorted ps
      LEFT JOIN phase_virtual_totals pvt ON pvt.phase_id = ps.id
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

        used_usd: pickFirst(r, ['used_usd'], 0),
        fill_pct: pickFirst(r, ['fill_pct'], 0),
        alloc_wallets: pickFirst(r, ['alloc_wallets'], 0),
        alloc_rows: pickFirst(r, ['alloc_rows'], 0),

        opened_at: pickFirst(r, ['opened_at'], null),
        closed_at: pickFirst(r, ['closed_at'], null),
        snapshot_taken_at: pickFirst(r, ['snapshot_taken_at'], null),
        finalized_at: pickFirst(r, ['finalized_at'], null),
        created_at: pickFirst(r, ['created_at'], null),
        updated_at: pickFirst(r, ['updated_at'], null),
      };
    });

    return NextResponse.json({ success: true, phases, debug: dbg?.[0] ?? null });
  } catch (e) {
    console.error('GET /api/phases/list failed:', e);
    return NextResponse.json({ success: false, error: 'PHASES_LIST_FAILED' }, { status: 500 });
  }
}