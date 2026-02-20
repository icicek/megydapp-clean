// app/api/_lib/phases/advance.ts
export const runtime = 'nodejs';

import { sql } from '@/app/api/_lib/db';

type AdvanceResult = {
  success: true;
  changed: boolean;
  activePhaseId: number | null;
  activePhaseNo: number | null;
  openedPhaseIds: number[];
  movedUnassigned: number;
  note?: string;
};

function n(v: any, def = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

async function moveAllUnassignedToPhase(phaseId: number) {
  // Purpose: “planned yoktu -> queue’da birikti -> planned gelince buraya akıt”
  // Economic truth is still phase_allocations (recompute). This is just bookkeeping.
  const moved = (await sql`
    UPDATE contributions
    SET
      phase_id = ${phaseId},
      alloc_phase_no = (SELECT phase_no FROM phases WHERE id = ${phaseId}),
      alloc_status = 'pending',
      alloc_updated_at = NOW()
    WHERE phase_id IS NULL
      AND COALESCE(alloc_status,'unassigned') = 'unassigned'
      AND COALESCE(network,'solana') = 'solana'
    RETURNING id
  `) as any[];
  return moved?.length ?? 0;
}

async function getQueueUsd(): Promise<number> {
  const r = (await sql`
    SELECT COALESCE(SUM(COALESCE(usd_value,0)::numeric),0)::numeric AS s
    FROM contributions
    WHERE phase_id IS NULL
      AND COALESCE(alloc_status,'unassigned') = 'unassigned'
      AND COALESCE(network,'solana') = 'solana'
      AND COALESCE(usd_value,0)::numeric > 0
  `) as any[];
  return n(r?.[0]?.s, 0);
}

async function computeForecastUsedUsdForPhase(phaseId: number): Promise<{ used: number; target: number; fill: number }> {
  // This is the SAME logic style as /api/phases/list (virtual split by cum targets),
  // but we only return used/target/fill for ONE phase.
  const rows = (await sql`
    WITH phases_sorted AS (
      SELECT
        p.*,
        COALESCE(
          p.target_usd,
          (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
          0
        )::numeric AS target_usd_num,
        SUM(
          COALESCE(
            p.target_usd,
            (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
            0
          )::numeric
        ) OVER (ORDER BY p.phase_no ASC, p.id ASC) AS cum_target,
        (
          SUM(
            COALESCE(
              p.target_usd,
              (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
              0
            )::numeric
          ) OVER (ORDER BY p.phase_no ASC, p.id ASC)
          - COALESCE(
              p.target_usd,
              (COALESCE(p.pool_megy,0)::numeric * COALESCE(p.rate_usd_per_megy,0)::numeric),
              0
            )::numeric
        ) AS cum_prev
      FROM phases p
      WHERE snapshot_taken_at IS NULL
    ),
    eligible_contributions AS (
      SELECT
        c.id AS contribution_id,
        c.timestamp,
        COALESCE(c.usd_value, 0)::numeric AS usd_value
      FROM contributions c
      WHERE COALESCE(c.usd_value,0)::numeric > 0
        AND COALESCE(c.network,'solana') = 'solana'
        AND COALESCE(c.alloc_status,'pending') <> 'invalid'
    ),
    contrib_running AS (
      SELECT
        ec.*,
        (SUM(ec.usd_value) OVER (ORDER BY ec.timestamp ASC, ec.contribution_id ASC) - ec.usd_value) AS rt_prev,
        SUM(ec.usd_value) OVER (ORDER BY ec.timestamp ASC, ec.contribution_id ASC) AS rt
      FROM eligible_contributions ec
    ),
    contrib_to_phase AS (
      SELECT
        ps.id AS phase_id,
        GREATEST(
          0,
          LEAST(cr.rt, ps.cum_target) - GREATEST(cr.rt_prev, ps.cum_prev)
        )::numeric AS usd_allocated_virtual
      FROM contrib_running cr
      JOIN phases_sorted ps
        ON cr.rt > ps.cum_prev
       AND cr.rt_prev < ps.cum_target
    )
    SELECT
      ps.id AS phase_id,
      COALESCE(ps.target_usd_num,0)::numeric AS target_usd,
      COALESCE(SUM(ctp.usd_allocated_virtual),0)::numeric AS used_usd_forecast
    FROM phases_sorted ps
    LEFT JOIN contrib_to_phase ctp
      ON ctp.phase_id = ps.id
    WHERE ps.id = ${phaseId}
    GROUP BY ps.id, ps.target_usd_num
    LIMIT 1;
  `) as any[];

  const row = rows?.[0] ?? null;
  const target = n(row?.target_usd, 0);
  const used = n(row?.used_usd_forecast, 0);
  const fill = target > 0 ? used / target : 0;
  return { used, target, fill };
}

async function findOneActiveForUpdate() {
  const a = (await sql`
    SELECT id, phase_no, rate_usd_per_megy
    FROM phases
    WHERE status = 'active'
      AND snapshot_taken_at IS NULL
    ORDER BY phase_no ASC, id ASC
    LIMIT 1
    FOR UPDATE
  `) as any[];
  return a?.[0] ?? null;
}

async function fixMultipleActivesKeepFirst(): Promise<{ changed: boolean; note?: string }> {
  const actives = (await sql`
    SELECT id, phase_no
    FROM phases
    WHERE status = 'active'
      AND snapshot_taken_at IS NULL
    ORDER BY phase_no ASC, id ASC
    FOR UPDATE
  `) as any[];

  if ((actives?.length ?? 0) <= 1) return { changed: false };

  const keepId = Number(actives[0].id);
  const dropIds = actives.slice(1).map((x: any) => Number(x.id)).filter((x: number) => x > 0);

  if (dropIds.length > 0) {
    // safest auto-fix: demote extras to reviewing (do NOT complete)
    await sql`
      UPDATE phases
      SET status = 'reviewing',
          updated_at = NOW()
      WHERE id = ANY(${dropIds}::bigint[])
    `;
  }
  return { changed: true, note: `AUTO_FIXED_MULTIPLE_ACTIVE: kept=${keepId}, demoted=${dropIds.join(',')}` };
}

async function openNextPlannedAfter(phaseNo: number, minRate: number) {
  const r = (await sql`
    UPDATE phases
    SET
      status = 'active',
      opened_at = COALESCE(opened_at, NOW()),
      updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM phases
      WHERE (status IS NULL OR status='planned')
        AND snapshot_taken_at IS NULL
        AND phase_no > ${phaseNo}
        AND COALESCE(rate_usd_per_megy,0) >= ${minRate}
      ORDER BY phase_no ASC, id ASC
      LIMIT 1
      FOR UPDATE
    )
    RETURNING id, phase_no, rate_usd_per_megy
  `) as any[];
  return r?.[0] ?? null;
}

async function openFirstPlanned(minRate = 0) {
  const r = (await sql`
    UPDATE phases
    SET
      status = 'active',
      opened_at = COALESCE(opened_at, NOW()),
      updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM phases
      WHERE (status IS NULL OR status='planned')
        AND snapshot_taken_at IS NULL
        AND COALESCE(rate_usd_per_megy,0) >= ${minRate}
      ORDER BY phase_no ASC, id ASC
      LIMIT 1
      FOR UPDATE
    )
    RETURNING id, phase_no, rate_usd_per_megy
  `) as any[];
  return r?.[0] ?? null;
}

async function markReviewing(phaseId: number) {
  await sql`
    UPDATE phases
    SET status = 'reviewing',
        closed_at = COALESCE(closed_at, NOW()),
        updated_at = NOW()
    WHERE id = ${phaseId}
      AND status = 'active'
  `;
}

export async function advancePhases(): Promise<AdvanceResult> {
  const lockKey = (BigInt(942003) * BigInt(1_000_000_000)).toString();

  await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;
  try {
    await sql`BEGIN`;

    let changed = false;
    const openedPhaseIds: number[] = [];
    let movedUnassigned = 0;

    // 1) hard safety: fix multiple actives automatically
    const fix = await fixMultipleActivesKeepFirst();
    if (fix.changed) changed = true;

    // 2) if no active, but queue has USD and planned exists -> open first planned
    let active = await findOneActiveForUpdate();

    if (!active) {
      const queueUsd = await getQueueUsd();
      if (queueUsd > 0) {
        const opened = await openFirstPlanned(0);
        if (opened?.id) {
          openedPhaseIds.push(Number(opened.id));
          changed = true;

          const moved = await moveAllUnassignedToPhase(Number(opened.id));
          movedUnassigned += moved;

          active = opened;
        }
      }
    }

    for (let guard = 0; guard < 25; guard++) {
      active = await findOneActiveForUpdate();
      if (!active?.id) break;

      const activeId = Number(active.id);
      const activeNo = Number(active.phase_no);
      const minRate = n(active.rate_usd_per_megy, 0);

      const { fill } = await computeForecastUsedUsdForPhase(activeId);

      // FULL threshold
      if (fill < 1) break;

      await markReviewing(activeId);
      changed = true;

      const next = await openNextPlannedAfter(activeNo, minRate);
      if (!next?.id) break;

      openedPhaseIds.push(Number(next.id));
      changed = true;

      movedUnassigned += await moveAllUnassignedToPhase(Number(next.id));
      // loop continues: chain-open if forecast says full
    }

    const finalActive = (await sql`
      SELECT id, phase_no
      FROM phases
      WHERE status = 'active' AND snapshot_taken_at IS NULL
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
      movedUnassigned,
      note: fix.note,
    };
  } catch (e) {
    try { await sql`ROLLBACK`; } catch {}
    throw e;
  } finally {
    await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
  }
}
