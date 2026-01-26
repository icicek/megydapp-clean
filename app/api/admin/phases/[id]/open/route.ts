// app/api/admin/phases/[id]/open/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

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

    // If any active exists, do NOT override (snapshot is the only advance mechanism)
    const activeRows = await sql`
      SELECT id, phase_no
      FROM phases
      WHERE status='active'
      LIMIT 1
      FOR UPDATE;
    `;
    const active = (activeRows as any[])[0] ?? null;
    if (active) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        { success: false, error: 'ACTIVE_PHASE_EXISTS', activePhaseId: Number(active.id) },
        { status: 409 }
      );
    }

    // Target must be planned
    const targetRows = await sql`
      SELECT id, phase_no, status
      FROM phases
      WHERE id=${phaseId}
      LIMIT 1
      FOR UPDATE;
    `;
    const target = (targetRows as any[])[0] ?? null;
    if (!target) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
    }

    const st = String(target.status ?? 'planned');
    if (st !== 'planned') {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'PHASE_NOT_PLANNED' }, { status: 409 });
    }

    // Optional: only allow opening the "next planned" (smallest phase_no among planned)
    const nextPlannedRows = await sql`
      SELECT id, phase_no
      FROM phases
      WHERE (status IS NULL OR status='planned')
      ORDER BY phase_no ASC
      LIMIT 1
      FOR UPDATE;
    `;
    const nextPlanned = (nextPlannedRows as any[])[0] ?? null;
    if (nextPlanned && Number(nextPlanned.id) !== Number(phaseId)) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        {
          success: false,
          error: 'NOT_NEXT_PLANNED',
          nextPlannedPhaseId: Number(nextPlanned.id),
          nextPlannedPhaseNo: Number(nextPlanned.phase_no),
        },
        { status: 409 }
      );
    }

    // Open it
    const openedRows = await sql`
      UPDATE phases
      SET status='active',
          opened_at=COALESCE(opened_at, NOW()),
          updated_at=NOW()
      WHERE id=${phaseId}
        AND (status IS NULL OR status='planned')
      RETURNING *;
    `;
    const opened = (openedRows as any[])[0] ?? null;

    if (!opened) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'OPEN_FAILED' }, { status: 409 });
    }

    await sql`COMMIT`;
    return NextResponse.json({ success: true, phase: opened });
  } catch (err: unknown) {
    try { await sql`ROLLBACK`; } catch {}
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}