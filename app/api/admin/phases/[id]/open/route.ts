// app/api/admin/phases/[id]/open/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

/*
ADMIN PHASE OPEN ROUTE

Purpose:
Manually open a planned phase.

IMPORTANT:
This route ONLY changes phase lifecycle.
It does NOT allocate contributions.

Allocation is handled by:
  /_lib/phases/allocator.ts
*/

function toId(params: any): number {
  const id = Number(params?.id);
  return Number.isFinite(id) ? id : 0;
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

    // 1️⃣ Check if active phase already exists
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

    // 2️⃣ Check target phase
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

    // 3️⃣ Ensure this is the next planned phase
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

    // 4️⃣ Open phase
    const updated = (await sql`
      UPDATE phases
      SET status='active',
          opened_at=COALESCE(opened_at, NOW()),
          updated_at=NOW()
      WHERE id=${phaseId}
      RETURNING *
    `) as any[];

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      phase: updated?.[0] ?? null,
      message:
        'Phase opened successfully. Queue allocation will be handled by allocator.'
    });

  } catch (err: unknown) {
    try {
      await sql`ROLLBACK`;
    } catch {}

    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}