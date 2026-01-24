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
      SELECT *
      FROM phases
      ORDER BY id DESC
    `;

    const phases = (rows as AnyRow[]).map((r) => {
      const id = asNumber(pickFirst(r, ['id', 'phase_id', 'phaseId'])) ?? 0;

      return {
        phase_id: id,
        phase_no: asNumber(pickFirst(r, ['phase_no', 'phaseNo'])) ?? id,
        name: String(pickFirst(r, ['name'], '') ?? ''),
        status: String(pickFirst(r, ['status', 'status_v2'], '') ?? ''),
        pool_megy: pickFirst(r, ['pool_megy', 'megy_pool'], null),
        rate_usd_per_megy: pickFirst(r, ['rate_usd_per_megy', 'rate'], null),
        target_usd: pickFirst(r, ['target_usd', 'usd_cap'], null),
        opened_at: pickFirst(r, ['opened_at'], null),
        closed_at: pickFirst(r, ['closed_at'], null),
        snapshot_taken_at: pickFirst(r, ['snapshot_taken_at'], null),
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
