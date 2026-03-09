// app/api/admin/phases/[id]/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

/*
ADMIN PHASE PATCH / DELETE ROUTE

Purpose:
- edit a planned phase
- delete a planned phase

Business rule for PATCH:
- phase rate order must remain monotonic
- previous phase rate <= current phase rate <= next phase rate
*/

function toId(params: any): number {
  const id = Number(params?.id);
  return Number.isFinite(id) ? id : 0;
}

function asNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const id = toId(ctx?.params);
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'BAD_PHASE_ID' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const name = body?.name != null ? String(body.name).trim() : null;
    const pool = body?.pool_megy != null ? asNum(body.pool_megy) : null;
    const rate = body?.rate_usd_per_megy != null ? asNum(body.rate_usd_per_megy) : null;

    if (name !== null && !name) {
      return NextResponse.json(
        { success: false, error: 'NAME_REQUIRED' },
        { status: 400 }
      );
    }

    if (pool !== null && (pool == null || pool <= 0)) {
      return NextResponse.json(
        { success: false, error: 'POOL_INVALID' },
        { status: 400 }
      );
    }

    if (rate !== null && (rate == null || rate <= 0)) {
      return NextResponse.json(
        { success: false, error: 'RATE_INVALID' },
        { status: 400 }
      );
    }

    await sql`BEGIN`;

    // 1) Load current planned phase
    const currentRows = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        name,
        status,
        COALESCE(pool_megy,0)::numeric AS pool_megy,
        COALESCE(rate_usd_per_megy,0)::numeric AS rate_usd_per_megy
      FROM phases
      WHERE id = ${id}
        AND (status IS NULL OR status = 'planned')
      LIMIT 1
      FOR UPDATE
    `) as any[];

    const current = currentRows?.[0] ?? null;

    if (!current) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        { success: false, error: 'PHASE_NOT_EDITABLE' },
        { status: 409 }
      );
    }

    const phaseNo = Number(current.phase_no ?? 0);

    const finalName = name !== null ? name : String(current.name || '');
    const finalPool = pool !== null ? pool : Number(current.pool_megy ?? 0);
    const finalRate =
      rate !== null ? rate : Number(current.rate_usd_per_megy ?? 0);

    // 2) Previous phase
    const prevRows = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        name,
        COALESCE(rate_usd_per_megy, rate, 0)::numeric AS rate_usd_per_megy
      FROM phases
      WHERE phase_no < ${phaseNo}
      ORDER BY phase_no DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `) as any[];

    const prev = prevRows?.[0] ?? null;
    const prevRate = prev ? Number(prev.rate_usd_per_megy ?? 0) : null;

    // 3) Next phase
    const nextRows = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        name,
        COALESCE(rate_usd_per_megy, rate, 0)::numeric AS rate_usd_per_megy
      FROM phases
      WHERE phase_no > ${phaseNo}
      ORDER BY phase_no ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `) as any[];

    const next = nextRows?.[0] ?? null;
    const nextRate = next ? Number(next.rate_usd_per_megy ?? 0) : null;

    // 4) Validate monotonic order
    if (
      prev &&
      Number.isFinite(prevRate) &&
      prevRate != null &&
      prevRate > 0 &&
      finalRate < prevRate
    ) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        {
          success: false,
          error: 'RATE_TOO_GOOD_VS_PREVIOUS',
          message:
            'Edited phase rate cannot be lower than the previous phase rate.',
          previous: {
            phase_id: Number(prev.id),
            phase_no: Number(prev.phase_no),
            name: String(prev.name || ''),
            rate_usd_per_megy: prevRate,
          },
          current: {
            phase_id: Number(current.id),
            phase_no: phaseNo,
            proposed_rate_usd_per_megy: finalRate,
          },
        },
        { status: 409 }
      );
    }

    if (
      next &&
      Number.isFinite(nextRate) &&
      nextRate != null &&
      nextRate > 0 &&
      finalRate > nextRate
    ) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        {
          success: false,
          error: 'RATE_TOO_BAD_VS_NEXT',
          message:
            'Edited phase rate cannot be higher than the next phase rate.',
          next: {
            phase_id: Number(next.id),
            phase_no: Number(next.phase_no),
            name: String(next.name || ''),
            rate_usd_per_megy: nextRate,
          },
          current: {
            phase_id: Number(current.id),
            phase_no: phaseNo,
            proposed_rate_usd_per_megy: finalRate,
          },
        },
        { status: 409 }
      );
    }

    // 5) Update planned phase
    const rows = (await sql/* sql */`
      UPDATE phases
      SET
        name = ${finalName},
        pool_megy = ${finalPool},
        rate_usd_per_megy = ${finalRate},
        updated_at = NOW()
      WHERE id = ${id}
        AND (status IS NULL OR status = 'planned')
      RETURNING *
    `) as any[];

    const phase = rows?.[0] ?? null;

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      phase,
      message: 'Phase updated successfully.',
    });
  } catch (err: unknown) {
    try {
      await sql`ROLLBACK`;
    } catch {}

    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const id = toId(ctx?.params);
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'BAD_PHASE_ID' },
        { status: 400 }
      );
    }

    const rows = (await sql/* sql */`
      DELETE FROM phases
      WHERE id = ${id}
        AND (status IS NULL OR status = 'planned')
        AND opened_at IS NULL
        AND closed_at IS NULL
        AND snapshot_taken_at IS NULL
      RETURNING id
    `) as any[];

    const deleted = rows?.[0]?.id ?? null;

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'PHASE_NOT_DELETABLE' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Phase deleted successfully.',
    });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}