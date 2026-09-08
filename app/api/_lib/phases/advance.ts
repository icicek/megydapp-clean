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

const EPS = 1e-9;

/**
 * Lifecycle invariant:
 * - Only 'active' phases can receive new allocations.
 * - 'reviewing' and 'completed' phases are closed/immutable from allocation perspective.
 * - If a reviewing phase later loses usd because of invalidation/blacklist cleanup,
 *   it must NOT be reopened or backfilled by lifecycle logic.
 * - Such a phase may snapshot below target.
 */

// ---- helpers ----

async function findOneActiveForUpdate(
  isTest: boolean
) {
  const a = (await sql/* sql */`
    SELECT
      id,
      phase_no,
      COALESCE(
        target_usd,
        usd_cap,
        (COALESCE(pool_megy,0)::numeric * COALESCE(rate_usd_per_megy,0)::numeric),
        (COALESCE(megy_pool,0)::numeric * COALESCE(rate,0)::numeric),
        0
      )::numeric AS target_usd
    FROM phases
    WHERE status = 'active'
      AND snapshot_taken_at IS NULL
      AND is_test = ${isTest}
    ORDER BY phase_no ASC, id ASC
    LIMIT 1
    FOR UPDATE
  `) as any[];

  return a?.[0] ?? null;
}

async function openFirstPlannedForUpdate(
  isTest: boolean
) {
  const r = (await sql/* sql */`
    WITH candidate AS (
      SELECT id
      FROM phases
      WHERE snapshot_taken_at IS NULL
        AND (status IS NULL OR status = 'planned')
        AND is_test = ${isTest}
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
    RETURNING
      p.id,
      p.phase_no,
      COALESCE(
        p.target_usd,
        p.usd_cap,
        (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
        (COALESCE(p.megy_pool,0)::numeric * COALESCE(p.rate,0)::numeric),
        0
      )::numeric AS target_usd
  `) as any[];

  return r?.[0] ?? null;
}

async function openNextPlannedAfterForUpdate(
  activePhaseNo: number,
  isTest: boolean
) {
  const r = (await sql/* sql */`
    WITH candidate AS (
      SELECT id
      FROM phases
      WHERE snapshot_taken_at IS NULL
        AND (status IS NULL OR status = 'planned')
        AND phase_no > ${activePhaseNo}
        AND is_test = ${isTest}
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
    RETURNING
      p.id,
      p.phase_no,
      COALESCE(
        p.target_usd,
        p.usd_cap,
        (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
        (COALESCE(p.megy_pool,0)::numeric * COALESCE(p.rate,0)::numeric),
        0
      )::numeric AS target_usd
  `) as any[];
  return r?.[0] ?? null;
}

async function markReviewing(phaseId: number) {
  // IMPORTANT:
  // Transition to 'reviewing' is one-way for allocation flow.
  // Even if later blacklist/invalidation reduces effective used_usd,
  // this phase must not be reopened for new allocations.
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
 * Safety:
 * Within one scope, if multiple active phases somehow exist,
 * keep the smallest phase_no active and demote the others
 * back to planned.
 */
async function fixMultipleActivesKeepFirst(
  isTest: boolean
): Promise<{
  changed: boolean;
  note?: string;
}> {
  const actives = (await sql/* sql */`
    SELECT id, phase_no
    FROM phases
    WHERE status = 'active'
      AND snapshot_taken_at IS NULL
      AND is_test = ${isTest}
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
      SET
        status = 'planned',
        closed_at = NULL,
        updated_at = NOW()
      WHERE id = ANY(${dropIds}::bigint[])
        AND snapshot_taken_at IS NULL
        AND is_test = ${isTest}
    `;
  }

  return {
    changed: true,
    note: `AUTO_FIXED_MULTIPLE_ACTIVE: kept=${keepId}, demoted_to_planned=${dropIds.join(',')}`,
  };
}

// ---- main ----

// ---- main ----

export async function advancePhases(
  opts: {
    isTest: boolean;
  }
): Promise<AdvanceResult> {
  const isTest = opts.isTest;

  // Global lock intentionally remains shared between scopes.
  const lockKey = (
    BigInt(942003) *
    BigInt(1_000_000_000)
  ).toString();

  await sql`
    SELECT pg_advisory_lock(
      ${lockKey}::bigint
    )
  `;

  try {
    await sql`BEGIN`;

    let changed = false;

    const openedPhaseIds: number[] = [];

    // 1) Safety:
    // Keep at most one active phase inside this scope.
    const fix =
      await fixMultipleActivesKeepFirst(
        isTest
      );

    if (fix.changed) {
      changed = true;
    }

    // 2) Ensure this scope has an active phase
    // if a planned phase exists.
    let active =
      await findOneActiveForUpdate(
        isTest
      );

    if (!active) {
      const opened =
        await openFirstPlannedForUpdate(
          isTest
        );

      if (opened?.id) {
        openedPhaseIds.push(
          Number(opened.id)
        );

        changed = true;
        active = opened;
      }
    }

    // 3) If the active phase is full:
    // move it to reviewing and open the
    // next planned phase in the SAME scope.
    //
    // Reviewing phases are never reopened,
    // even if later blacklist/invalidation
    // reduces their effective allocated USD.
    for (
      let guard = 0;
      guard < 25;
      guard++
    ) {
      active =
        await findOneActiveForUpdate(
          isTest
        );

      if (!active?.id) {
        break;
      }

      const activeId =
        Number(active.id);

      const activeNo =
        Number(active.phase_no);

      const targetUsd =
        n(active.target_usd, 0);

      // target 0 => never considered full
      if (targetUsd <= 0) {
        break;
      }

      const usedUsd =
        await computeUsedUsdFromAllocations(
          activeId
        );

      if (
        usedUsd + EPS <
        targetUsd
      ) {
        break;
      }

      // Active phase is full.
      await markReviewing(
        activeId
      );

      changed = true;

      const next =
        await openNextPlannedAfterForUpdate(
          activeNo,
          isTest
        );

      if (!next?.id) {
        break;
      }

      openedPhaseIds.push(
        Number(next.id)
      );

      changed = true;

      // Loop continues in case the next
      // phase is already full (rare).
    }

    // Final active phase in this scope.
    const finalActive =
      (await sql/* sql */`
        SELECT
          id,
          phase_no
        FROM phases
        WHERE status = 'active'
          AND snapshot_taken_at IS NULL
          AND is_test = ${isTest}
        ORDER BY
          phase_no ASC,
          id ASC
        LIMIT 1
      `) as any[];

    const fa =
      finalActive?.[0] ?? null;

    await sql`COMMIT`;

    return {
      success: true,
      changed,
      activePhaseId:
        fa?.id
          ? Number(fa.id)
          : null,
      activePhaseNo:
        fa?.phase_no
          ? Number(fa.phase_no)
          : null,
      openedPhaseIds,
      movedUnassigned: 0,
      note: fix.note,
    };
  } catch (e) {
    try {
      await sql`ROLLBACK`;
    } catch { }

    throw e;
  } finally {
    await sql`
      SELECT pg_advisory_unlock(
        ${lockKey}::bigint
      )
    `;
  }
}