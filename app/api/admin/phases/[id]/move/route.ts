//app/api/admin/phases/[id]/move/route.ts
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

    const id = toId(ctx?.params);
    if (!id) return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const dir = String(body?.dir || 'up'); // 'up' | 'down'

    await sql`BEGIN`;

    // current planned phase
    const curRows = await sql`
      SELECT id, phase_no
      FROM phases
      WHERE id=${id} AND (status IS NULL OR status='planned')
      FOR UPDATE;
    `;
    const cur = (curRows as any[])[0];
    if (!cur) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'PHASE_NOT_MOVABLE' }, { status: 409 });
    }

    // neighbor planned phase
    const neighRows = await sql`
      SELECT id, phase_no
      FROM phases
      WHERE (status IS NULL OR status='planned')
        AND phase_no ${dir === 'up' ? '<' : '>'} ${cur.phase_no}
      ORDER BY phase_no ${dir === 'up' ? 'DESC' : 'ASC'}
      LIMIT 1
      FOR UPDATE;
    `;
    const neigh = (neighRows as any[])[0];
    if (!neigh) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'NO_NEIGHBOR' }, { status: 409 });
    }

    // swap
    await sql`UPDATE phases SET phase_no=${neigh.phase_no}, updated_at=NOW() WHERE id=${cur.id};`;
    await sql`UPDATE phases SET phase_no=${cur.phase_no}, updated_at=NOW() WHERE id=${neigh.id};`;

    await sql`COMMIT`;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    try { await sql`ROLLBACK`; } catch {}
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}