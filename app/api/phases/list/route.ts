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

    const rows = await sql`
      SELECT
        p.*,
        COALESCE(a.used_usd, 0)::numeric AS used_usd,
        COALESCE(a.alloc_wallets, 0)::int AS alloc_wallets,
        COALESCE(a.alloc_rows, 0)::int AS alloc_rows,
        CASE
          WHEN COALESCE(p.target_usd, 0)::numeric > 0
          THEN (COALESCE(a.used_usd, 0)::numeric / COALESCE(p.target_usd, 0)::numeric)
          ELSE 0
        END AS fill_pct
      FROM phases p
      LEFT JOIN (
        SELECT
          phase_id,
          COUNT(*)::int AS alloc_rows,
          COUNT(DISTINCT wallet_address)::int AS alloc_wallets,
          COALESCE(SUM(usd_allocated), 0)::numeric AS used_usd
        FROM phase_allocations
        GROUP BY phase_id
      ) a ON a.phase_id = p.id
      ORDER BY p.phase_no ASC, p.id ASC;
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

        // ✅ NEW: progress fields
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

    return NextResponse.json({ success: true, phases });
  } catch (e) {
    console.error('GET /api/phases/list failed:', e);
    return NextResponse.json({ success: false, error: 'PHASES_LIST_FAILED' }, { status: 500 });
  }
}