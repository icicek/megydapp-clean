// app/api/admin/phases/[id]/open/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { allocateQueueFIFO } from '@/app/api/_lib/phases/allocator';
import { advancePhases } from '@/app/api/_lib/phases/advance';

/*
ADMIN PHASE OPEN ROUTE

Purpose:
Manually open a planned phase, then let allocator + lifecycle
settle queued remainder across multiple phases if needed.
*/

function toId(params: any): number {
  const id = Number(params?.id);
  return Number.isFinite(id) ? id : 0;
}

async function settlePhaseFlowAfterOpen(maxRounds = 6) {
  const rounds: Array<{
    round: number;
    allocator: any;
    allocatorError: string | null;
    phaseAdvance: any;
    phaseAdvanceError: string | null;
  }> = [];

  let lastAllocator: any = null;
  let lastAllocatorError: string | null = null;
  let lastAdvance: any = null;
  let lastAdvanceError: string | null = null;

  for (let round = 1; round <= maxRounds; round++) {
    let allocatorRes: any = null;
    let allocatorErr: string | null = null;
    let advanceRes: any = null;
    let advanceErr: string | null = null;

    try {
      allocatorRes = await allocateQueueFIFO({ maxSteps: 20 });
      lastAllocator = allocatorRes;
      lastAllocatorError = null;
    } catch (e: any) {
      allocatorErr = String(e?.message || e);
      lastAllocatorError = allocatorErr;
      console.error(`❌ allocator failed after open in round ${round}:`, allocatorErr, e);
    }

    try {
      advanceRes = await advancePhases();
      lastAdvance = advanceRes;
      lastAdvanceError = null;
    } catch (e: any) {
      advanceErr = String(e?.message || e);
      lastAdvanceError = advanceErr;
      console.warn(`⚠️ advance failed after open in round ${round}:`, advanceErr, e);
    }

    rounds.push({
      round,
      allocator: allocatorRes,
      allocatorError: allocatorErr,
      phaseAdvance: advanceRes,
      phaseAdvanceError: advanceErr,
    });

    const movedTotal = Number(allocatorRes?.moved_total ?? 0);
    const changed = !!advanceRes?.changed;
    const opened = Array.isArray(advanceRes?.openedPhaseIds) ? advanceRes.openedPhaseIds.length : 0;

    if (movedTotal <= 0 && !changed && opened <= 0) {
      break;
    }
  }

  return {
    rounds,
    allocator: lastAllocator,
    allocatorError: lastAllocatorError,
    phaseAdvance: lastAdvance,
    phaseAdvanceError: lastAdvanceError,
  };
}

export async function POST(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const phaseId = toId(ctx?.params);

    if (!phaseId || phaseId <= 0) {
      return NextResponse.json(
        { success: false, error: 'BAD_PHASE_ID' },
        { status: 400 }
      );
    }

    await sql`BEGIN`;

    const activeRows = (await sql`
      SELECT id
      FROM phases
      WHERE status='active'
      LIMIT 1
      FOR UPDATE
    `) as any[];

    if (activeRows?.length) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        { success: false, error: 'ACTIVE_PHASE_EXISTS' },
        { status: 409 }
      );
    }

    const targetRows = (await sql`
      SELECT id, status, phase_no
      FROM phases
      WHERE id=${phaseId}
      LIMIT 1
      FOR UPDATE
    `) as any[];

    const target = targetRows?.[0];

    if (!target) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        { success: false, error: 'PHASE_NOT_FOUND' },
        { status: 404 }
      );
    }

    const st = String(target.status || 'planned');

    if (st !== 'planned') {
      await sql`ROLLBACK`;
      return NextResponse.json(
        { success: false, error: 'PHASE_NOT_PLANNED' },
        { status: 409 }
      );
    }

    const nextRows = (await sql`
      SELECT id, phase_no
      FROM phases
      WHERE (status IS NULL OR status='planned')
        AND snapshot_taken_at IS NULL
      ORDER BY phase_no ASC
      LIMIT 1
      FOR UPDATE
    `) as any[];

    const nextPlanned = nextRows?.[0] ?? null;

    if (!nextPlanned) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        { success: false, error: 'NO_PLANNED_PHASE' },
        { status: 409 }
      );
    }

    if (Number(nextPlanned.id) !== Number(phaseId)) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        {
          success: false,
          error: 'NOT_NEXT_PLANNED',
          nextPlannedId: Number(nextPlanned.id)
        },
        { status: 409 }
      );
    }

    const updated = (await sql`
      UPDATE phases
      SET status='active',
          opened_at=COALESCE(opened_at, NOW()),
          updated_at=NOW()
      WHERE id=${phaseId}
      RETURNING *
    `) as any[];

    await sql`COMMIT`;

    let allocator: any = null;
    let allocatorError: string | null = null;
    let phaseAdvance: any = null;
    let phaseAdvanceError: string | null = null;
    let phaseFlowRounds: any[] = [];

    try {
      const flow = await settlePhaseFlowAfterOpen(6);
      allocator = flow.allocator;
      allocatorError = flow.allocatorError;
      phaseAdvance = flow.phaseAdvance;
      phaseAdvanceError = flow.phaseAdvanceError;
      phaseFlowRounds = Array.isArray(flow.rounds) ? flow.rounds : [];
    } catch (e: any) {
      allocatorError = String(e?.message || e);
      console.warn('⚠️ settlePhaseFlowAfterOpen failed:', allocatorError, e);
    }

    return NextResponse.json({
      success: true,
      phase: updated?.[0] ?? null,
      allocator,
      allocatorError,
      phaseAdvance,
      phaseAdvanceError,
      phaseFlowRounds,
      message:
        'Phase opened successfully. Allocator and lifecycle settle loop completed.'
    });

  } catch (err: unknown) {
    try {
      await sql`ROLLBACK`;
    } catch {}

    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}