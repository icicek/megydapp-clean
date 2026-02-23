// app/api/_lib/phases/allocator.ts
import { sql } from '@/app/api/_lib/db';

const ALLOCATOR_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  'dev';

type AllocateResult = {
  success: true;
  moved_total: number;
  phases_touched: Array<{
    phase_id: number;
    phase_no: number;
    status: string;
    moved: number;
    reason: 'OK' | 'PHASE_FULL' | 'NO_ACTIVE' | 'NO_PLANNED' | 'NO_QUEUE';
  }>;
  version?: string;
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

function num(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

// Global allocator lock (single-run)
async function acquireAllocatorLock() {
  const key = (BigInt(942002) * BigInt(1_000_000_000) + BigInt(777)).toString();
  await sql`SELECT pg_advisory_lock(${key}::bigint)`;
  return key;
}

async function releaseAllocatorLock(key: string) {
  await sql`SELECT pg_advisory_unlock(${key}::bigint)`;
}

async function getActivePhaseForUpdate() {
  const rows = (await sql/* sql */`
    SELECT id, phase_no, status, COALESCE(target_usd, 0)::numeric AS target_usd
    FROM phases
    WHERE status = 'active' AND snapshot_taken_at IS NULL
    ORDER BY phase_no ASC
    LIMIT 1
    FOR UPDATE
  `) as any[];

  return rows?.[0] ?? null;
}

async function openNextPlannedPhase(cursorPhaseNo: number | null) {
  const rows = (await sql/* sql */`
    UPDATE phases
    SET
      status = 'active',
      opened_at = COALESCE(opened_at, NOW()),
      updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM phases
      WHERE (status IS NULL OR status = 'planned')
        AND snapshot_taken_at IS NULL
        ${cursorPhaseNo == null ? sql`` : sql`AND phase_no > ${cursorPhaseNo}`}
      ORDER BY phase_no ASC
      LIMIT 1
      FOR UPDATE
    )
    RETURNING id, phase_no, status, COALESCE(target_usd, 0)::numeric AS target_usd
  `) as any[];

  return rows?.[0] ?? null;
}

async function computeUsedUsd(phaseId: number) {
  const rows = (await sql/* sql */`
    SELECT COALESCE(SUM(COALESCE(usd_value, 0)), 0)::numeric AS used_usd
    FROM contributions
    WHERE phase_id = ${phaseId}
      AND COALESCE(usd_value,0)::numeric > 0
      AND COALESCE(alloc_status,'unassigned') <> 'invalid'
      AND COALESCE(network,'solana') = 'solana'
  `) as any[];
  return num(rows?.[0]?.used_usd, 0);
}

async function hasQueue() {
  const rows = (await sql/* sql */`
    SELECT 1
    FROM contributions
    WHERE phase_id IS NULL
      AND COALESCE(alloc_status, 'unassigned') IN ('unassigned','pending')
      AND network = 'solana'
    LIMIT 1
  `) as any[];
  return !!rows?.[0];
}

async function sweepUnassignedToPhase(phaseId: number, remaining: number | null) {
  const moved = (await sql/* sql */`
    WITH ph AS (
      SELECT id, phase_no, COALESCE(rate_usd_per_megy, 0)::numeric AS rate
      FROM phases
      WHERE id = ${phaseId}
      LIMIT 1
      FOR UPDATE
    ),
    queue AS (
      SELECT
        c.id,
        c.wallet_address,
        COALESCE(c.usd_value, 0)::numeric AS usd_value,
        SUM(COALESCE(c.usd_value, 0)::numeric) OVER (
          ORDER BY c."timestamp" ASC NULLS LAST, c.id ASC
        ) AS run
      FROM contributions c
      LEFT JOIN token_registry tr ON tr.mint = c.token_contract
      WHERE c.phase_id IS NULL
        AND COALESCE(c.alloc_status, 'unassigned') IN ('unassigned','pending')
        AND COALESCE(c.network,'solana') = 'solana'
        AND COALESCE(c.usd_value,0)::numeric > 0
        AND (
          c.token_contract = ${WSOL_MINT}
          OR tr.status IN ('healthy','walking_dead')
        )
    ),
    pick AS (
      SELECT id
      FROM queue
      WHERE ${remaining === null ? sql`TRUE` : sql`run <= ${remaining}`}
    ),
    up AS (
      UPDATE contributions c
      SET
        phase_id = ${phaseId},
        alloc_phase_no = (SELECT phase_no FROM ph),
        alloc_status = 'allocated',
        alloc_updated_at = NOW()
      WHERE c.id IN (SELECT id FROM pick)
        AND c.phase_id IS NULL
        AND COALESCE(c.alloc_status, 'unassigned') IN ('unassigned','pending')
      RETURNING c.id, c.wallet_address, COALESCE(c.usd_value,0)::numeric AS usd_value
    )
    INSERT INTO phase_allocations
      (phase_id, contribution_id, wallet_address, usd_allocated, megy_allocated, created_at)
    SELECT
      ${phaseId}::bigint,
      up.id::bigint,
      up.wallet_address::text,
      up.usd_value::numeric,
      CASE WHEN (SELECT rate FROM ph) > 0
           THEN (up.usd_value / (SELECT rate FROM ph))::numeric
           ELSE 0::numeric
      END AS megy_allocated,
      NOW()
    FROM up
    WHERE NOT EXISTS (
      SELECT 1 FROM phase_allocations pa WHERE pa.contribution_id = up.id
    )
    RETURNING contribution_id
  `) as any[];

  return moved?.length ?? 0;
}

async function maybeMarkReviewing(phaseId: number) {
  const rows = (await sql/* sql */`
    SELECT COALESCE(target_usd, 0)::numeric AS target_usd
    FROM phases
    WHERE id = ${phaseId}
    LIMIT 1
    FOR UPDATE
  `) as any[];

  const target = num(rows?.[0]?.target_usd, 0);
  if (target <= 0) return false;

  const used = await computeUsedUsd(phaseId);
  if (used < target) return false;

  await sql/* sql */`
    UPDATE phases
    SET
      status = 'reviewing',
      closed_at = COALESCE(closed_at, NOW()),
      updated_at = NOW()
    WHERE id = ${phaseId}
      AND status = 'active'
      AND snapshot_taken_at IS NULL
  `;

  return true;
}

export async function allocateQueueFIFO(opts?: { maxSteps?: number }): Promise<AllocateResult> {
  const maxSteps = Math.max(1, Math.min(50, Number(opts?.maxSteps ?? 20)));

  const lockKey = await acquireAllocatorLock();
  const phases_touched: AllocateResult['phases_touched'] = [];
  let moved_total = 0;

  try {
    await sql`BEGIN`;

    const q = await hasQueue();
    if (!q) {
      await sql`COMMIT`;
      return {
        success: true,
        moved_total: 0,
        phases_touched: [{ phase_id: 0, phase_no: 0, status: '-', moved: 0, reason: 'NO_QUEUE' }],
        version: ALLOCATOR_VERSION,
      };
    }

    let cursorPhaseNo: number | null = null;

    for (let step = 0; step < maxSteps; step++) {
      let active = await getActivePhaseForUpdate();

      if (!active) {
        const opened = await openNextPlannedPhase(cursorPhaseNo);
        if (!opened?.id) {
          phases_touched.push({ phase_id: 0, phase_no: 0, status: '-', moved: 0, reason: 'NO_PLANNED' });
          break;
        }
        active = opened;
      }

      const phaseId = Number(active.id);
      const phaseNo = Number(active.phase_no);
      const targetUsd = num(active.target_usd, 0);
      const usedUsd = await computeUsedUsd(phaseId);

      const remaining = targetUsd > 0 ? Math.max(0, targetUsd - usedUsd) : null;

      if (remaining !== null && remaining <= 0) {
        const marked = await maybeMarkReviewing(phaseId);
        phases_touched.push({
          phase_id: phaseId,
          phase_no: phaseNo,
          status: marked ? 'reviewing' : String(active.status || 'active'),
          moved: 0,
          reason: 'PHASE_FULL',
        });
        cursorPhaseNo = phaseNo;
        continue;
      }

      const moved = await sweepUnassignedToPhase(phaseId, remaining);
      moved_total += moved;

      const nowFull = await maybeMarkReviewing(phaseId);

      phases_touched.push({
        phase_id: phaseId,
        phase_no: phaseNo,
        status: nowFull ? 'reviewing' : 'active',
        moved,
        reason: nowFull ? 'PHASE_FULL' : 'OK',
      });

      if (!nowFull) break;

      cursorPhaseNo = phaseNo;

      const stillQueue = await hasQueue();
      if (!stillQueue) break;
    }

    await sql`COMMIT`;

    return { success: true, moved_total, phases_touched, version: ALLOCATOR_VERSION };
  } catch (e) {
    try { await sql`ROLLBACK`; } catch {}
    throw e;
  } finally {
    try { await releaseAllocatorLock(lockKey); } catch {}
  }
}