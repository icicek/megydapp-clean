// app/api/admin/phases/[id]/assign-unassigned/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

/*
ADMIN ASSIGN-UNASSIGNED ROUTE

LEGACY / MANUAL-RECOVERY ONLY

Old behavior:
- moved unassigned contributions directly into contributions.phase_id

Modern phase architecture:
- queue allocation must be handled by allocator.ts
- economic truth must live in phase_allocations
- direct phase assignment is no longer authoritative

Therefore:
- this route is intentionally disabled for automatic assignment
- kept only for backward compatibility / admin UI stability
*/

type Ctx = { params: Promise<{ id: string }> };

function toNum(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req as any);

    const { id } = await ctx.params;
    const phaseId = toNum(id, 0);

    if (!phaseId || phaseId <= 0) {
      return NextResponse.json(
        { success: false, error: 'BAD_PHASE_ID' },
        { status: 400 }
      );
    }

    const ph = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        status,
        snapshot_taken_at,
        finalized_at,
        COALESCE(
          target_usd,
          usd_cap,
          (COALESCE(pool_megy,0)::numeric * COALESCE(rate_usd_per_megy,0)::numeric),
          (COALESCE(megy_pool,0)::numeric * COALESCE(rate,0)::numeric),
          0
        )::numeric AS target_usd
      FROM phases
      WHERE id = ${phaseId}
      LIMIT 1
    `) as any[];

    const phase = ph?.[0] ?? null;

    if (!phase) {
      return NextResponse.json(
        { success: false, error: 'PHASE_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      moved: 0,
      reason: 'LEGACY_DISABLED_USE_ALLOCATOR',
      phaseId: Number(phase.id),
      phaseNo: Number(phase.phase_no ?? 0),
      status: String(phase.status ?? ''),
      targetUsd: Number(phase.target_usd ?? 0),
      snapshotTakenAt: phase.snapshot_taken_at ?? null,
      finalizedAt: phase.finalized_at ?? null,
      message:
        'Direct queue-to-phase assignment is disabled in the modern phase architecture. Queue allocation must be handled by allocator.',
      legacy: true,
    });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}