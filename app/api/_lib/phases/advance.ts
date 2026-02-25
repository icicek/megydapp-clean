// app/api/_lib/phases/advance.ts
export const runtime = 'nodejs';

import { sql } from '@/app/api/_lib/db';

type AdvanceResult = {
  success: true;
  changed: boolean;
  activePhaseId: number | null;
  activePhaseNo: number | null;
  openedPhaseIds: number[];
  movedUnassigned: number; // artık 0 dönecek (move işini allocator yapıyor)
  note?: string;
};

function n(v: any, def = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

// ---- helpers ----

async function findOneActiveForUpdate() {
  const a = (await sql/* sql */`
    SELECT id, phase_no, COALESCE(target_usd,0)::numeric AS target_usd
    FROM phases
    WHERE status = 'active'
      AND snapshot_taken_at IS NULL
    ORDER BY phase_no ASC, id ASC
    LIMIT 1
    FOR UPDATE
  `) as any[];
  return a?.[0] ?? null;
}

async function openFirstPlannedForUpdate() {
  const r = (await sql/* sql */`
    WITH candidate AS (
      SELECT id
      FROM phases
      WHERE snapshot_taken_at IS NULL
        AND (status IS NULL OR status = 'planned')
      ORDER BY phase_no ASC, id ASC
      LIMIT 1
      FOR UPDATE
    )
    UPDATE phases p
    SET
      status = 'active',
      opened_at = COALESCE(p.opened_at, NOW()),
      updated_at = NOW()
    FROM candidate c
    WHERE p.id = c.id
    RETURNING p.id, p.phase_no, COALESCE(p.target_usd,0)::numeric AS target_usd
  `) as any[];
  return r?.[0] ?? null;
}

async function openNextPlannedAfterForUpdate(activePhaseNo: number) {
  const r = (await sql/* sql */`
    WITH candidate AS (
      SELECT id
      FROM phases
      WHERE snapshot_taken_at IS NULL
        AND (status IS NULL OR status = 'planned')
        AND phase_no > ${activePhaseNo}
      ORDER BY phase_no ASC, id ASC
      LIMIT 1
      FOR UPDATE
    )
    UPDATE phases p
    SET
      status = 'active',
      opened_at = COALESCE(p.opened_at, NOW()),
      updated_at = NOW()
    FROM candidate c
    WHERE p.id = c.id
    RETURNING p.id, p.phase_no, COALESCE(p.target_usd,0)::numeric AS target_usd
  `) as any[];
  return r?.[0] ?? null;
}

async function markReviewing(phaseId: number) {
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
}

/**
 * REAL usedUsd = phase_allocations sum (economic truth)
 * (allocator zaten eligible filtreliyor; ama burada da sadece allocations okuyoruz)
 */
async function computeUsedUsdFromAllocations(phaseId: number): Promise<number> {
  const r = (await sql/* sql */`
    SELECT COALESCE(SUM(COALESCE(usd_allocated,0)::numeric),0)::numeric AS s
    FROM phase_allocations
    WHERE phase_id = ${phaseId}
  `) as any[];
  return n(r?.[0]?.s, 0);
}

/**
 * Safety: multiple actives -> keep smallest phase_no, demote others to reviewing.
 */
async function fixMultipleActivesKeepFirst(): Promise<{ changed: boolean; note?: string }> {
  const actives = (await sql/* sql */`
    SELECT id, phase_no
    FROM phases
    WHERE status = 'active'
      AND snapshot_taken_at IS NULL
    ORDER BY phase_no ASC, id ASC
    FOR UPDATE
  `) as any[];

  if ((actives?.length ?? 0) <= 1) return { changed: false };

  const keepId = Number(actives[0].id);
  const dropIds = actives
    .slice(1)
    .map((x: any) => Number(x.id))
    .filter((x: number) => x > 0);

  if (dropIds.length) {
    await sql/* sql */`
      UPDATE phases
      SET status = 'reviewing',
          updated_at = NOW()
      WHERE id = ANY(${dropIds}::bigint[])
    `;
  }

  return {
    changed: true,
    note: `AUTO_FIXED_MULTIPLE_ACTIVE: kept=${keepId}, demoted=${dropIds.join(',')}`,
  };
}

// ---- main ----

export async function advancePhases(): Promise<AdvanceResult> {
  // global lock
  const lockKey = (BigInt(942003) * BigInt(1_000_000_000)).toString();

  await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;
  try {
    await sql`BEGIN`;

    let changed = false;
    const openedPhaseIds: number[] = [];

    // 1) safety: multiple actives fix
    const fix = await fixMultipleActivesKeepFirst();
    if (fix.changed) changed = true;

    // 2) ensure there is an active phase if planned exists
    let active = await findOneActiveForUpdate();
    if (!active) {
      const opened = await openFirstPlannedForUpdate();
      if (opened?.id) {
        openedPhaseIds.push(Number(opened.id));
        changed = true;
        active = opened;
      }
    }

    // 3) if active is full -> move to reviewing and open next planned (chain)
    for (let guard = 0; guard < 25; guard++) {
      active = await findOneActiveForUpdate();
      if (!active?.id) break;

      const activeId = Number(active.id);
      const activeNo = Number(active.phase_no);
      const targetUsd = n(active.target_usd, 0);

      // target 0 => never “full”
      if (targetUsd <= 0) break;

      const usedUsd = await computeUsedUsdFromAllocations(activeId);

      if (usedUsd < targetUsd) break;

      // active is full => reviewing
      await markReviewing(activeId);
      changed = true;

      const next = await openNextPlannedAfterForUpdate(activeNo);
      if (!next?.id) break;

      openedPhaseIds.push(Number(next.id));
      changed = true;

      // loop continues in case next already full (rare)
    }

    // final active
    const finalActive = (await sql/* sql */`
      SELECT id, phase_no
      FROM phases
      WHERE status = 'active'
        AND snapshot_taken_at IS NULL
      ORDER BY phase_no ASC, id ASC
      LIMIT 1
    `) as any[];

    const fa = finalActive?.[0] ?? null;

    await sql`COMMIT`;

    return {
      success: true,
      changed,
      activePhaseId: fa?.id ? Number(fa.id) : null,
      activePhaseNo: fa?.phase_no ? Number(fa.phase_no) : null,
      openedPhaseIds,
      movedUnassigned: 0,
      note: fix.note,
    };
  } catch (e) {
    try {
      await sql`ROLLBACK`;
    } catch {}
    throw e;
  } finally {
    await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
  }
}