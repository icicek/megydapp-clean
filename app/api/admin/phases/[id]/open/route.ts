// app/api/admin/phases/[id]/open/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

async function sweepUnassignedToPhase(phaseId: number) {
  // phase target + remaining capacity
  const ph = (await sql/* sql */`
    SELECT
      id,
      COALESCE(target_usd, 0)::numeric AS target_usd
    FROM phases
    WHERE id = ${phaseId}
    LIMIT 1
    FOR UPDATE
  `) as any[];

  const targetUsd = Number(ph?.[0]?.target_usd ?? 0);

  // used usd already in this phase
  const used = (await sql/* sql */`
    SELECT COALESCE(SUM(COALESCE(usd_value, 0)), 0)::numeric AS used_usd
    FROM contributions
    WHERE phase_id = ${phaseId}
  `) as any[];

  const usedUsd = Number(used?.[0]?.used_usd ?? 0);

  // if no target, assign all
  const remaining = targetUsd > 0 ? Math.max(0, targetUsd - usedUsd) : null;

  if (remaining !== null && remaining <= 0) {
    return { moved: 0, reason: 'PHASE_FULL' as const };
  }

  // Move FIFO rows until remaining USD is reached (window sum)
  const moved = (await sql/* sql */`
    WITH queue AS (
      SELECT
        id,
        COALESCE(usd_value, 0)::numeric AS usd_value,
        SUM(COALESCE(usd_value, 0)::numeric) OVER (
          ORDER BY timestamp ASC NULLS LAST, id ASC
        ) AS run
      FROM contributions
      WHERE phase_id IS NULL
        AND COALESCE(alloc_status, 'unassigned') = 'unassigned'
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
      alloc_status = 'pending',
      alloc_updated_at = NOW()
    WHERE c.id IN (SELECT id FROM pick)
    RETURNING c.id
  `) as any[];

  return { moved: moved?.length ?? 0, reason: 'OK' as const };
}

function toId(params: any): number {
  const id = Number(params?.id);
  return Number.isFinite(id) ? id : 0;
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const phaseId = toId(ctx?.params);
    if (!phaseId || phaseId <= 0) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    await sql`BEGIN`;

    // 1) Active phase var mı? (varsa OPEN yasak)
    const activeRows = (await sql`
      SELECT id
      FROM phases
      WHERE status='active'
      LIMIT 1
      FOR UPDATE;
    `) as any[];

    if (activeRows?.length) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'ACTIVE_PHASE_EXISTS' }, { status: 409 });
    }

    // 2) Target phase planned mı?
    const targetRows = (await sql`
      SELECT id, status, phase_no
      FROM phases
      WHERE id=${phaseId}
      LIMIT 1
      FOR UPDATE;
    `) as any[];

    const target = targetRows?.[0];
    if (!target) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
    }

    const st = String(target.status || 'planned');
    if (!(st === 'planned')) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'PHASE_NOT_PLANNED' }, { status: 409 });
    }

    // 3) Active yokken sadece "next planned" açılabilsin (min phase_no planned)
    const nextRows = (await sql`
      SELECT id, phase_no
      FROM phases
      WHERE (status IS NULL OR status='planned')
        AND snapshot_taken_at IS NULL
      ORDER BY phase_no ASC
      LIMIT 1
      FOR UPDATE;
    `) as any[];

    const nextPlanned = nextRows?.[0] ?? null;
    if (!nextPlanned) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'NO_PLANNED_PHASE' }, { status: 409 });
    }

    if (Number(nextPlanned.id) !== Number(phaseId)) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        { success: false, error: 'NOT_NEXT_PLANNED', nextPlannedId: Number(nextPlanned.id) },
        { status: 409 }
      );
    }

    // 4) Open it
    const updated = (await sql`
      UPDATE phases
      SET status='active',
          opened_at=COALESCE(opened_at, NOW()),
          updated_at=NOW()
      WHERE id=${phaseId}
      RETURNING *;
    `) as any[];

    // ✅ NEW: sweep queue into this newly opened phase (capacity-aware)
    const sweep = await sweepUnassignedToPhase(phaseId);

    await sql`COMMIT`;

    return NextResponse.json({ success: true, phase: updated?.[0] ?? null, sweep });
  } catch (err: unknown) {
    try {
      await sql`ROLLBACK`;
    } catch {}
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}