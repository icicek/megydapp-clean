// app/api/admin/phases/recompute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

type Body = { phaseId?: number };

// WSOL mint (native SOL wrapper) – senin sistemde SOL bazen "SOL" da olabiliyor,
// ama asıl güvenli ayrım mint ile.
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

function num(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

type Phase = {
  id: number;
  phase_no: number;

  // legacy
  pool_megy: any;
  rate_usd_per_megy: any;
  target_usd: any;
  status: 'planned' | 'open' | 'closed';

  // v2 (new)
  megy_pool?: any;
  rate?: any;
  usd_cap?: any;
  status_v2?: 'draft' | 'active' | 'finalized' | null;
  snapshot_taken_at?: string | null;
};

type Contribution = {
  id: number;
  wallet_address: string;
  token_contract: string | null;
  usd_value: number;
  timestamp: string;
};

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    const body = (await req.json().catch(() => ({}))) as Body;
    const phaseId = Number(body.phaseId);
    if (!Number.isFinite(phaseId) || phaseId <= 0) {
      return NextResponse.json({ success: false, error: 'phaseId is required' }, { status: 400 });
    }

    // single-flight recompute lock
    await sql`SELECT pg_advisory_lock(942001)`;
    try {
      // 1) start phase
      const start = (await sql/* sql */`
        SELECT id, phase_no, status, snapshot_taken_at
        FROM phases
        WHERE id = ${phaseId}
        LIMIT 1
      `) as any[];      

      const startRow = start?.[0];
      if (!startRow) {
        return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
      }
      if (startRow.snapshot_taken_at) {
        return NextResponse.json({ success: false, error: 'PHASE_SNAPSHOTTED' }, { status: 409 });
      }
      if (startRow.status === 'closed') {
        // closed zaten “finalized” sayılabilir, ama asıl kural snapshot. Yine de safe kalsın.
        return NextResponse.json({ success: false, error: 'PHASE_CLOSED' }, { status: 409 });
      }      

      const startNo = Number(startRow.phase_no);

      // 2) phases to recompute (planned/open only)
      const phases = (await sql/* sql */`
        SELECT
          id,
          phase_no,
          pool_megy,
          rate_usd_per_megy,
          target_usd,
          status,
          megy_pool,
          rate,
          usd_cap,
          status_v2,
          snapshot_taken_at
        FROM phases
        WHERE phase_no >= ${startNo}
          AND status IN ('planned','open')
        ORDER BY phase_no ASC
      `) as any as Phase[];

      if (!phases.length) {
        return NextResponse.json({ success: false, error: 'NO_PHASES_TO_RECOMPUTE' }, { status: 409 });
      }

      const snap = phases.find((p) => p.snapshot_taken_at);
      if (snap) {
       return NextResponse.json(
        { success: false, error: 'RECOMPUTE_BLOCKED_BY_SNAPSHOT', phaseId: snap.id, phaseNo: snap.phase_no },
        { status: 409 }
       );
      }

      // 3) delete allocations only for recompute phases
      const phaseIds = phases.map((p) => Number(p.id)).filter((x) => Number.isFinite(x) && x > 0);

      if (phaseIds.length) {
      await sql/* sql */`
          DELETE FROM phase_allocations pa
          USING jsonb_to_recordset(${JSON.stringify(phaseIds)}::jsonb) AS x(id text)
          WHERE pa.phase_id = x.id::bigint
        `;
      }

      // 4) baseline: closed phases already consumed some eligible USD
      //    (closed phases immutable by design)
      const baselineRes = (await sql/* sql */`
        SELECT COALESCE(SUM(pa.usd_allocated), 0)::float AS usd_used
        FROM phase_allocations pa
        JOIN phases p ON p.id = pa.phase_id
        WHERE p.snapshot_taken_at IS NOT NULL
      `) as any[];
      const baselineUsedUsd = num(baselineRes?.[0]?.usd_used, 0);

      // 5) eligible contributions, ordered
      // Rules:
      // - usd_value > 0
      // - token_contract NULL or WSOL => treat as SOL native eligible
      // - SPL => only if token_registry says healthy or walking_dead
      //
      // NOTE: If registry row missing => not eligible (prevents unknown tokens from polluting phase math)
      const contribs = (await sql/* sql */`
        SELECT
          c.id,
          c.wallet_address,
          c.token_contract,
          COALESCE(c.usd_value, 0)::float AS usd_value,
          COALESCE(c.timestamp, NOW())::text AS timestamp
        FROM contributions c
        LEFT JOIN token_registry tr ON tr.mint = c.token_contract
        WHERE
          COALESCE(c.usd_value,0) > 0
          AND (
            c.token_contract IS NULL
            OR c.token_contract = ${WSOL_MINT}
            OR (
              tr.mint IS NOT NULL
              AND tr.status IN ('healthy','walking_dead')
            )
          )
        ORDER BY c.timestamp ASC, c.id ASC
      `) as any as Contribution[];

      // 6) advance cursor by baselineUsedUsd (closed phases already “took” those)
      let cursor = 0;
      let acc = 0;
      while (cursor < contribs.length && acc < baselineUsedUsd) {
        acc += num(contribs[cursor].usd_value, 0);
        cursor++;
      }

      // 7) local phase state
      const state = phases.map((p) => {
        const pool = num(p.megy_pool ?? p.pool_megy, 0);
        const rate = num(p.rate ?? p.rate_usd_per_megy, 1);
      
        // usd_cap öncelikli; yoksa target_usd; yoksa pool*rate
        const cap = num(p.usd_cap ?? p.target_usd ?? (pool * rate), 0);
      
        return {
          id: Number(p.id),
          phase_no: Number(p.phase_no),
          status: p.status,
          pool,
          rate,
          targetUsd: cap,
          remainingUsd: cap,
          usedMegy: 0,
        };
      });      

      const rowsToInsert: Array<{
        phase_id: number;
        contribution_id: number;
        wallet_address: string;
        usd_allocated: number;
        megy_allocated: number;
      }> = [];

      // 8) split allocation (A)
      for (let i = cursor; i < contribs.length; i++) {
        let usdLeft = num(contribs[i].usd_value, 0);
        if (usdLeft <= 0) continue;

        for (const ph of state) {
          if (usdLeft <= 0) break;
          if (ph.remainingUsd <= 0) continue;

          const usdTake = Math.min(usdLeft, ph.remainingUsd);
          const megyTake = ph.rate > 0 ? usdTake / ph.rate : 0;

          // guard by remaining pool (rounding safety)
          const remainingMegy = Math.max(0, ph.pool - ph.usedMegy);
          const megyFinal = Math.min(megyTake, remainingMegy);
          const usdFinal = megyFinal * ph.rate;

          if (usdFinal <= 0 || megyFinal <= 0) continue;

          rowsToInsert.push({
            phase_id: ph.id,
            contribution_id: contribs[i].id,
            wallet_address: contribs[i].wallet_address,
            usd_allocated: usdFinal,
            megy_allocated: megyFinal,
          });

          ph.remainingUsd -= usdFinal;
          ph.usedMegy += megyFinal;
          usdLeft -= usdFinal;
        }

        // if usdLeft > 0 => not enough phases (spill). ok.
      }

      // 9) bulk insert (safe chunking)
      const CHUNK = 800;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
        const chunk = rowsToInsert.slice(i, i + CHUNK);

        // using json-to-recordset for clean multi insert
        await sql/* sql */`
          INSERT INTO phase_allocations
            (phase_id, contribution_id, wallet_address, usd_allocated, megy_allocated)
          SELECT
            x.phase_id::bigint,
            x.contribution_id::bigint,
            x.wallet_address::text,
            x.usd_allocated::numeric,
            x.megy_allocated::numeric
          FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(
            phase_id text,
            contribution_id text,
            wallet_address text,
            usd_allocated text,
            megy_allocated text
          )
        `;
      }

      const summary = state.map((p) => ({
        phase_no: p.phase_no,
        usd_cap: p.targetUsd,
        remaining_usd: p.remainingUsd,
        used_megy: p.usedMegy,
        megy_pool: p.pool,
        rate_usd_per_megy: p.rate,
      }));      

      return NextResponse.json({
        success: true,
        startPhaseNo: startNo,
        baselineUsedUsd,
        contributionsConsidered: contribs.length,
        inserted: rowsToInsert.length,
        phases: summary,
      });
    } finally {
      await sql`SELECT pg_advisory_unlock(942001)`;
    }
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
