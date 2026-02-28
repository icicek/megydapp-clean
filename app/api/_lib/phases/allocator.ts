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

async function getContributionRemainingUsd(contributionId: number): Promise<number> {
  const r = (await sql/* sql */`
    SELECT
      COALESCE(c.usd_value,0)::numeric AS usd_value,
      COALESCE(SUM(COALESCE(pa.usd_allocated,0)::numeric),0)::numeric AS usd_alloc
    FROM contributions c
    LEFT JOIN phase_allocations pa ON pa.contribution_id = c.id
    WHERE c.id = ${contributionId}
    GROUP BY c.id
    LIMIT 1
  `) as any[];

  const usdValue = num(r?.[0]?.usd_value, 0);
  const usdAlloc = num(r?.[0]?.usd_alloc, 0);
  return Math.max(0, usdValue - usdAlloc);
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
    SELECT COALESCE(SUM(COALESCE(usd_allocated,0)::numeric),0)::numeric AS used_usd
    FROM phase_allocations
    WHERE phase_id = ${phaseId}
  `) as any[];
  return num(rows?.[0]?.used_usd, 0);
}

async function hasQueue() {
  const rows = (await sql/* sql */`
    WITH alloc AS (
      SELECT contribution_id, COALESCE(SUM(COALESCE(usd_allocated,0)::numeric),0)::numeric AS usd_alloc
      FROM phase_allocations
      GROUP BY contribution_id
    )
    SELECT 1
    FROM contributions c
    LEFT JOIN alloc a ON a.contribution_id = c.id
    WHERE c.phase_id IS NULL
      AND COALESCE(c.alloc_status,'unassigned') IN ('unassigned','partial','pending')
      AND COALESCE(c.network,'solana') = 'solana'
      AND COALESCE(c.usd_value,0)::numeric > COALESCE(a.usd_alloc,0)::numeric
    LIMIT 1
  `) as any[];
  return !!rows?.[0];
}

async function hasWork(activePhaseId: number | null) {
  // 1) Queue var mı?
  const q = (await sql/* sql */`
    SELECT 1
    FROM contributions c
    LEFT JOIN token_registry tr ON tr.mint = c.token_contract
    WHERE COALESCE(c.network,'solana') = 'solana'
      AND COALESCE(c.usd_value,0)::numeric > 0
      AND (
        c.token_contract = ${WSOL_MINT}
        OR tr.status IN ('healthy','walking_dead')
      )
      AND c.phase_id IS NULL
      AND COALESCE(c.alloc_status,'unassigned') IN ('unassigned','pending')
    LIMIT 1
  `) as any[];

  if (q?.[0]) return true;

  // 2) Stuck var mı? (activePhaseId yoksa bakma)
  if (!activePhaseId) return false;

  const s = (await sql/* sql */`
    SELECT 1
    FROM contributions c
    LEFT JOIN token_registry tr ON tr.mint = c.token_contract
    WHERE COALESCE(c.network,'solana') = 'solana'
      AND COALESCE(c.usd_value,0)::numeric > 0
      AND (
        c.token_contract = ${WSOL_MINT}
        OR tr.status IN ('healthy','walking_dead')
      )
      AND c.phase_id = ${activePhaseId}
      AND COALESCE(c.alloc_status,'unassigned') = 'unassigned'
    LIMIT 1
  `) as any[];

  return !!s?.[0];
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

async function allocateIntoPhaseSplitFIFO(phaseId: number, remainingPhaseUsd: number | null) {
  // remainingPhaseUsd: null => unlimited
  const eps = 1e-9;

  const ph = (await sql/* sql */`
    SELECT id, phase_no, COALESCE(rate_usd_per_megy,0)::numeric AS rate, COALESCE(target_usd,0)::numeric AS target_usd
    FROM phases
    WHERE id = ${phaseId}
    LIMIT 1
    FOR UPDATE
  `) as any[];

  const phaseNo = Number(ph?.[0]?.phase_no ?? 0);
  const rate = num(ph?.[0]?.rate, 0);

  let phaseLeft = remainingPhaseUsd;

  let movedAllocRows = 0;

  for (let guard = 0; guard < 5000; guard++) {
    if (phaseLeft !== null && phaseLeft <= eps) break;

    // next eligible contribution (FIFO)
    const next = (await sql/* sql */`
      WITH alloc AS (
        SELECT contribution_id, COALESCE(SUM(COALESCE(usd_allocated,0)::numeric),0)::numeric AS usd_alloc
        FROM phase_allocations
        GROUP BY contribution_id
      )
      SELECT
        c.id,
        c.wallet_address,
        COALESCE(c.usd_value,0)::numeric AS usd_value,
        COALESCE(a.usd_alloc,0)::numeric AS usd_alloc
      FROM contributions c
      LEFT JOIN alloc a ON a.contribution_id = c.id
      LEFT JOIN token_registry tr ON tr.mint = c.token_contract
      WHERE c.phase_id IS NULL
        AND COALESCE(c.alloc_status,'unassigned') IN ('unassigned','partial','pending')
        AND COALESCE(c.network,'solana') = 'solana'
        AND COALESCE(c.usd_value,0)::numeric > COALESCE(a.usd_alloc,0)::numeric
        AND COALESCE(c.usd_value,0)::numeric > 0
        AND (
          c.token_contract = ${WSOL_MINT}
          OR tr.status IN ('healthy','walking_dead')
        )
      ORDER BY c."timestamp" ASC NULLS LAST, c.id ASC
      LIMIT 1
      FOR UPDATE
      SKIP LOCKED
    `) as any[];

    if (!next?.[0]) break;

    const cId = Number(next[0].id);
    const wallet = String(next[0].wallet_address);
    const usdValue = num(next[0].usd_value, 0);
    const usdAlloc = num(next[0].usd_alloc, 0);

    const cLeft = Math.max(0, usdValue - usdAlloc);
    if (cLeft <= eps) {
      // normalize status
      await sql/* sql */`
        UPDATE contributions
        SET alloc_status='allocated', alloc_updated_at=NOW()
        WHERE id = ${cId}
      `;
      continue;
    }

    const take = phaseLeft === null ? cLeft : Math.min(cLeft, phaseLeft);
    if (take <= eps) break;

    const megy = rate > 0 ? take / rate : 0;

    // insert allocation row (ALLOW multiple rows per contribution across phases)
    await sql/* sql */`
      INSERT INTO phase_allocations (phase_id, contribution_id, wallet_address, usd_allocated, megy_allocated, created_at)
      VALUES (${phaseId}::bigint, ${cId}::bigint, ${wallet}::text, ${take}::numeric, ${megy}::numeric, NOW())
    `;

    movedAllocRows += 1;

    // update contribution status to partial/allocated
    const newRemaining = cLeft - take;
    const newStatus = newRemaining <= eps ? 'allocated' : 'partial';

    await sql/* sql */`
      UPDATE contributions
      SET alloc_status = ${newStatus},
          alloc_phase_no = ${phaseNo},
          alloc_updated_at = NOW()
      WHERE id = ${cId}
    `;

    if (phaseLeft !== null) phaseLeft -= take;
  }

  return movedAllocRows;
}

export async function allocateQueueFIFO(opts?: { maxSteps?: number }): Promise<AllocateResult> {
  const maxSteps = Math.max(1, Math.min(50, Number(opts?.maxSteps ?? 20)));

  const lockKey = await acquireAllocatorLock();
  const phases_touched: AllocateResult['phases_touched'] = [];
  let moved_total = 0;

  try {
    await sql`BEGIN`;

    // We may have "stuck" unassigned rows already inside the active phase even if queue is empty.
    let preActive = await getActivePhaseForUpdate();
    const preActiveId = preActive?.id ? Number(preActive.id) : null;

    const work = await hasWork(preActiveId);
    if (!work) {
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

      const movedStep = await allocateIntoPhaseSplitFIFO(phaseId, remaining);
      moved_total += movedStep;

      // After moving, if it becomes full, mark reviewing
      const nowFull = await maybeMarkReviewing(phaseId);

      phases_touched.push({
        phase_id: phaseId,
        phase_no: phaseNo,
        status: nowFull ? 'reviewing' : 'active',
        moved: movedStep,
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