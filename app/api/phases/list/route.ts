// app/api/phases/list/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

type AnyRow = Record<string, any>;

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

function asNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

    // 1) Phases + allocation totals (economic truth)
    const rows = await sql`
      WITH phases_sorted AS (
        SELECT
          p.*,
          COALESCE(
            p.target_usd,
            p.usd_cap,
            (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
            (COALESCE(p.megy_pool,0)::numeric * COALESCE(p.rate,0)::numeric),
            0
          )::numeric AS target_usd_num
        FROM phases p
        WHERE p.snapshot_taken_at IS NULL
      ),
      phase_alloc_totals AS (
        SELECT
          pa.phase_id,
          COALESCE(SUM(COALESCE(pa.usd_allocated,0)::numeric),0)::numeric AS used_usd,
          COUNT(*)::int AS alloc_rows,
          COUNT(DISTINCT pa.wallet_address)::int AS alloc_wallets
        FROM phase_allocations pa
        GROUP BY pa.phase_id
      )
      SELECT
        ps.*,
        COALESCE(pat.used_usd, 0)::numeric AS used_usd,
        COALESCE(pat.alloc_rows, 0)::int AS alloc_rows,
        COALESCE(pat.alloc_wallets, 0)::int AS alloc_wallets,
        CASE
          WHEN COALESCE(ps.target_usd_num, 0)::numeric > 0
          THEN (COALESCE(pat.used_usd, 0)::numeric / COALESCE(ps.target_usd_num, 0)::numeric)
          ELSE 0
        END AS fill_pct
      FROM phases_sorted ps
      LEFT JOIN phase_alloc_totals pat ON pat.phase_id = ps.id
      ORDER BY ps.phase_no ASC, ps.id ASC;
    `;

    // 2) Queue (unassigned & not tied to a phase)
    const queue = await sql`
      SELECT
        COALESCE(SUM(COALESCE(c.usd_value,0)::numeric),0)::numeric AS queue_usd
      FROM contributions c
      LEFT JOIN token_registry tr ON tr.mint = c.token_contract
      WHERE c.phase_id IS NULL
        AND COALESCE(c.alloc_status,'unassigned') = 'unassigned'
        AND COALESCE(c.network,'solana') = 'solana'
        AND COALESCE(c.usd_value,0)::numeric > 0
        AND (
          c.token_contract IS NULL
          OR c.token_contract = ${WSOL_MINT}
          OR (tr.mint IS NOT NULL AND tr.status IN ('healthy','walking_dead'))
        );
    `;

    // 3) Debug (eligible set summary; excludes snapshotted so it won’t “count twice”)
    const debug = await sql`
      SELECT
        COUNT(*)::int AS eligible_rows,
        COALESCE(SUM(COALESCE(c.usd_value,0)::numeric),0)::numeric AS eligible_usd_sum,
        MIN(c.timestamp) AS first_ts,
        MAX(c.timestamp) AS last_ts
      FROM contributions c
      LEFT JOIN token_registry tr ON tr.mint = c.token_contract
      WHERE COALESCE(c.network,'solana') = 'solana'
        AND COALESCE(c.usd_value,0)::numeric > 0
        AND COALESCE(c.alloc_status,'unassigned') <> 'snapshotted'
        AND (
          c.token_contract IS NULL
          OR c.token_contract = ${WSOL_MINT}
          OR (tr.mint IS NOT NULL AND tr.status IN ('healthy','walking_dead'))
        );
    `;

    // 4) Current active phase (authoritative)
    const activeNow = await sql`
      SELECT id, phase_no
      FROM phases
      WHERE status = 'active'
        AND snapshot_taken_at IS NULL
      ORDER BY phase_no ASC, id ASC
      LIMIT 1;
    `;
    const an = (activeNow as any[])?.[0] ?? null;

    const phases = (rows as AnyRow[]).map((r) => {
      const phaseId = asNumber(r.id) ?? 0;

      const rateRaw = r.rate_usd_per_megy ?? r.rate ?? null;
      const rateNum = rateRaw === '' ? null : asNumber(rateRaw);

      return {
        phase_id: phaseId,
        phase_no: asNumber(r.phase_no) ?? phaseId,
        name: String(r.name ?? ''),
        status: String(r.status ?? ''),

        pool_megy: r.pool_megy ?? r.megy_pool ?? null,
        rate_usd_per_megy: rateNum,
        target_usd: r.target_usd ?? r.usd_cap ?? null,

        // primary truth
        used_usd: r.used_usd ?? 0,
        fill_pct: r.fill_pct ?? 0,
        alloc_wallets: r.alloc_wallets ?? 0,
        alloc_rows: r.alloc_rows ?? 0,

        // timestamps
        opened_at: r.opened_at ?? null,
        closed_at: r.closed_at ?? null,
        snapshot_taken_at: r.snapshot_taken_at ?? null,
        finalized_at: r.finalized_at ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      };
    });

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