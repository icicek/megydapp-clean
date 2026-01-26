// app/api/admin/phases/[id]/route.ts
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
function asNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);
    const id = toId(ctx?.params);
    if (!id) return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const name = body?.name != null ? String(body.name).trim() : null;
    const pool = body?.pool_megy != null ? asNum(body.pool_megy) : null;
    const rate = body?.rate_usd_per_megy != null ? asNum(body.rate_usd_per_megy) : null;

    if (name !== null && !name) {
      return NextResponse.json({ success: false, error: 'NAME_REQUIRED' }, { status: 400 });
    }
    if (pool !== null && (pool == null || pool <= 0)) {
      return NextResponse.json({ success: false, error: 'POOL_INVALID' }, { status: 400 });
    }
    if (rate !== null && (rate == null || rate <= 0)) {
      return NextResponse.json({ success: false, error: 'RATE_INVALID' }, { status: 400 });
    }

    // planned olmayanı update etmeyelim
    const rows = await sql`
      UPDATE phases
      SET
        name = COALESCE(${name}, name),
        pool_megy = COALESCE(${pool}, pool_megy),
        rate_usd_per_megy = COALESCE(${rate}, rate_usd_per_megy),
        updated_at = NOW()
      WHERE id = ${id}
        AND (status IS NULL OR status = 'planned')
      RETURNING *;
    `;

    const phase = (rows as any[])[0] ?? null;
    if (!phase) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_EDITABLE' }, { status: 409 });
    }

    return NextResponse.json({ success: true, phase });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
export async function DELETE(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);
    const id = toId(ctx?.params);
    if (!id) return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });

    const rows = await sql`
      DELETE FROM phases
      WHERE id = ${id}
        AND (status IS NULL OR status = 'planned')
        AND opened_at IS NULL
        AND closed_at IS NULL
        AND snapshot_taken_at IS NULL
      RETURNING id;
    `;

    const deleted = (rows as any[])[0]?.id;
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_DELETABLE' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}