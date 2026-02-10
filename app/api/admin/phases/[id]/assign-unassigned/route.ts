// app/api/admin/phases/[id]/assign-unassigned/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

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
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    // Capacity-aware: fazın target'ı doluysa taşımayı engelle
    const ph = (await sql/* sql */`
      SELECT id, phase_no, COALESCE(target_usd, 0)::numeric AS target_usd
      FROM phases
      WHERE id = ${phaseId}
      LIMIT 1
      FOR UPDATE
    `) as any[];

    if (!ph?.length) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
    }

    const phaseNo = Number(ph[0].phase_no);
    const targetUsd = Number(ph[0].target_usd ?? 0);

    const used = (await sql/* sql */`
      SELECT COALESCE(SUM(COALESCE(usd_value, 0)), 0)::numeric AS used_usd
      FROM contributions
      WHERE phase_id = ${phaseId}
    `) as any[];

    const usedUsd = Number(used?.[0]?.used_usd ?? 0);

    const remaining = targetUsd > 0 ? Math.max(0, targetUsd - usedUsd) : null;
    if (remaining !== null && remaining <= 0) {
      return NextResponse.json({
        success: true,
        moved: 0,
        reason: 'PHASE_FULL',
        phaseId,
        phaseNo,
        targetUsd,
        usedUsd,
      });
    }

    // FIFO queue → bu faza taşı (window running sum ile kapasiteyi aşmadan)
    const movedRows = (await sql/* sql */`
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
        phase_id         = ${phaseId},
        alloc_phase_no   = ${phaseNo},
        alloc_status     = 'pending',
        alloc_updated_at = NOW()
      WHERE c.id IN (SELECT id FROM pick)
      RETURNING c.id
    `) as any[];

    return NextResponse.json({
      success: true,
      moved: movedRows?.length ?? 0,
      reason: 'OK',
      phaseId,
      phaseNo,
      targetUsd,
      usedUsd,
      remaining,
    });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
