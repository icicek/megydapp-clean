// app/api/_lib/phases/allocator.ts
import { sql } from '@/app/api/_lib/db';

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
};

function num(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

// Global allocator lock (single-run)
async function acquireAllocatorLock() {
  // stable bigint key
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
  // open smallest phase_no among planned > cursor (or overall smallest planned)
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
    WITH queue AS (
      SELECT
        id,
        COALESCE(usd_value, 0)::numeric AS usd_value,
        SUM(COALESCE(usd_value, 0)::numeric) OVER (
          ORDER BY "timestamp" ASC NULLS LAST, id ASC
        ) AS run
      FROM contributions
      WHERE phase_id IS NULL
        AND COALESCE(alloc_status, 'unassigned') IN ('unassigned','pending')
        AND network = 'solana'
    ),
    pick AS (
      SELECT id
      FROM queue
      WHERE ${remaining === null ? sql`TRUE` : sql`run <= ${remaining}`}
    )
    UPDATE contributions c
    SET
      phase_id = ${phaseId},
      alloc_phase_no = (SELECT phase_no FROM phases WHERE id = ${phaseId}),
      alloc_status = 'unassigned',
      alloc_updated_at = NOW()
    WHERE c.id IN (SELECT id FROM pick)
      AND c.phase_id IS NULL
      AND COALESCE(c.alloc_status, 'unassigned') IN ('unassigned','pending')
    RETURNING c.id
  `) as any[];

  return moved?.length ?? 0;
}

async function maybeMarkReviewing(phaseId: number) {
  // If phase is at/over target, mark as reviewing (but DO NOT snapshot)
  const rows = (await sql/* sql */`
    SELECT COALESCE(target_usd, 0)::numeric AS target_usd
    FROM phases
    WHERE id = ${phaseId}
    LIMIT 1
    FOR UPDATE
  `) as any[];

  const target = num(rows?.[0]?.target_usd, 0);
  if (target <= 0) return false; // no target means never "full"

  const used = await computeUsedUsd(phaseId);
  if (used < target) return false;

  // move active -> reviewing
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

/**
 * Allocate queued (phase_id IS NULL) contributions into phases FIFO.
 * Guarantees at most ONE active phase.
 */
export async function allocateQueueFIFO(opts?: { maxSteps?: number }): Promise<AllocateResult> {
  const maxSteps = Math.max(1, Math.min(50, Number(opts?.maxSteps ?? 20)));

  const lockKey = await acquireAllocatorLock();

  const phases_touched: AllocateResult['phases_touched'] = [];
  let moved_total = 0;

  try {
    await sql`BEGIN`;

    // Quick exit if no queue
    const q = await hasQueue();
    if (!q) {
      await sql`COMMIT`;
      return { success: true, moved_total: 0, phases_touched: [{ phase_id: 0, phase_no: 0, status: '-', moved: 0, reason: 'NO_QUEUE' }] };
    }

    let cursorPhaseNo: number | null = null;

    for (let step = 0; step < maxSteps; step++) {
      // Ensure exactly one active phase
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
        // full already -> mark reviewing and continue to next planned
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

      // Move from queue into this active phase
      const moved = await sweepUnassignedToPhase(phaseId, remaining);
      moved_total += moved;

      // After moving, if it becomes full, mark reviewing
      const nowFull = await maybeMarkReviewing(phaseId);

      phases_touched.push({
        phase_id: phaseId,
        phase_no: phaseNo,
        status: nowFull ? 'reviewing' : 'active',
        moved,
        reason: nowFull ? 'PHASE_FULL' : 'OK',
      });

      // If we didn't fill the phase, stop (either queue is empty or phase not full yet)
      if (!nowFull) break;

      // If phase became reviewing, continue to open next planned phase and keep draining queue
      cursorPhaseNo = phaseNo;

      // If queue is empty, stop
      const stillQueue = await hasQueue();
      if (!stillQueue) break;
    }

    await sql`COMMIT`;

    return { success: true, moved_total, phases_touched };
  } catch (e) {
    try { await sql`ROLLBACK`; } catch {}
    throw e;
  } finally {
    try { await releaseAllocatorLock(lockKey); } catch {}
  }
}
