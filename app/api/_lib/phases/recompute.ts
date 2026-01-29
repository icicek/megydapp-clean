// app/api/_lib/phases/recompute.ts
import { sql } from '@/app/api/_lib/db';

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

  // v2
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

export type RecomputeResult = {
  success: true;
  startPhaseNo: number;
  baselineUsedUsd: number;
  contributionsConsidered: number;
  inserted: number;
  phases: Array<{
    phase_no: number;
    usd_cap: number;
    remaining_usd: number;
    used_megy: number;
    megy_pool: number;
    rate_usd_per_megy: number;
  }>;
};

export async function recomputeFromPhaseId(phaseId: number): Promise<RecomputeResult> {
  if (!Number.isFinite(phaseId) || phaseId <= 0) {
    throw Object.assign(new Error('invalid phaseId'), { statusCode: 400 });
  }

  // phase-bazlı lock (recompute tekil)
  const lockKey = (BigInt(942001) * BigInt(1_000_000_000) + BigInt(Math.trunc(phaseId))).toString();
  await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;

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
      throw Object.assign(new Error('PHASE_NOT_FOUND'), { statusCode: 404, code: 'PHASE_NOT_FOUND' });
    }
    if (startRow.snapshot_taken_at) {
      throw Object.assign(new Error('PHASE_SNAPSHOTTED'), { statusCode: 409, code: 'PHASE_SNAPSHOTTED' });
    }

    const startNo = Number(startRow.phase_no);

    // 2) phases to recompute (planned/active only, v2)
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
        AND (status IS NULL OR status IN ('planned','active'))
        AND snapshot_taken_at IS NULL
      ORDER BY phase_no ASC
    `) as any as Phase[];

    if (!phases.length) {
      throw Object.assign(new Error('NO_PHASES_TO_RECOMPUTE'), { statusCode: 409, code: 'NO_PHASES_TO_RECOMPUTE' });
    }

    // planned/open içinde snapshot varsa blokla
    const snap = phases.find((p) => p.snapshot_taken_at);
    if (snap) {
      throw Object.assign(new Error('RECOMPUTE_BLOCKED_BY_SNAPSHOT'), {
        statusCode: 409,
        code: 'RECOMPUTE_BLOCKED_BY_SNAPSHOT',
        phaseId: snap.id,
        phaseNo: snap.phase_no,
      });
    }

    // 3) recompute edilecek phase id’leri
    const phaseIds = phases.map((p) => Number(p.id)).filter((x) => Number.isFinite(x) && x > 0);
    if (phaseIds.length) {
      const phaseIdObjs = phaseIds.map((id) => ({ id }));

      // ✅ KRİTİK FIX:
      // Bu phase'lere daha önce allocate edilmiş contribution'ları tekrar pending'e çek
      // (snapshotlı phase’ler zaten burada yok, sadece planned/open seti)
      await sql/* sql */`
        UPDATE contributions c
        SET alloc_status = 'pending',
            alloc_updated_at = NOW()
        WHERE c.id IN (
          SELECT DISTINCT pa.contribution_id
          FROM phase_allocations pa
          JOIN jsonb_to_recordset(${JSON.stringify(phaseIdObjs)}::jsonb) AS x(id text)
            ON pa.phase_id = x.id::bigint
        )
        AND COALESCE(c.alloc_status,'pending') = 'allocated'
      `;

      // allocations’ı sil
      await sql/* sql */`
        DELETE FROM phase_allocations pa
        USING jsonb_to_recordset(${JSON.stringify(phaseIdObjs)}::jsonb) AS x(id text)
        WHERE pa.phase_id = x.id::bigint
      `;
    }

    // 4) baseline: snapshotted phases already used some USD (rapor amaçlı)
    const baselineRes = (await sql/* sql */`
      SELECT COALESCE(SUM(pa.usd_allocated), 0)::float AS usd_used
      FROM phase_allocations pa
      JOIN phases p ON p.id = pa.phase_id
      WHERE p.snapshot_taken_at IS NOT NULL
    `) as any[];
    const baselineUsedUsd = num(baselineRes?.[0]?.usd_used, 0);

    // 5) eligible + pending contributions
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
        AND COALESCE(c.alloc_status,'pending') = 'pending'
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

    // 6) phase state
    const state = phases.map((p) => {
      const pool = num(p.megy_pool ?? p.pool_megy, 0);
      const rate = num(p.rate ?? p.rate_usd_per_megy, 1);
      const cap = num(p.usd_cap ?? p.target_usd ?? pool * rate, 0);

      return {
        id: Number(p.id),
        phase_no: Number(p.phase_no),
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

    // 7) split allocation
    for (let i = 0; i < contribs.length; i++) {
      let usdLeft = num(contribs[i].usd_value, 0);
      if (usdLeft <= 0) continue;

      for (const ph of state) {
        if (usdLeft <= 0) break;
        if (ph.remainingUsd <= 0) continue;

        const usdTake = Math.min(usdLeft, ph.remainingUsd);
        const megyTake = ph.rate > 0 ? usdTake / ph.rate : 0;

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
    }

    // 8) bulk insert allocations
    const CHUNK = 800;
    for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
      const chunk = rowsToInsert.slice(i, i + CHUNK);
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

    // 9) mark allocated contributions (pending -> allocated)
    const uniqContribIds = Array.from(new Set(rowsToInsert.map((r) => r.contribution_id)))
      .filter((x) => Number.isFinite(x) && x > 0);

    if (uniqContribIds.length) {
      const objs = uniqContribIds.map((id) => ({ id }));
      await sql/* sql */`
        UPDATE contributions c
        SET alloc_status = 'allocated',
            alloc_updated_at = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(objs)}::jsonb) AS x(id text)
        WHERE c.id = x.id::bigint
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

    return {
      success: true,
      startPhaseNo: startNo,
      baselineUsedUsd,
      contributionsConsidered: contribs.length,
      inserted: rowsToInsert.length,
      phases: summary,
    };
  } finally {
    await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
  }
}
