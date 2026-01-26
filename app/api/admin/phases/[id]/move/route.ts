// app/api/admin/phases/[id]/move/route.ts
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
    if (!id) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const dirRaw = String(body?.dir || 'up');
    const dir: 'up' | 'down' = dirRaw === 'down' ? 'down' : 'up';

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
    let neighRows: any[];

    if (dir === 'up') {
      neighRows = (await sql`
        SELECT id, phase_no
        FROM phases
        WHERE (status IS NULL OR status='planned')
          AND phase_no < ${cur.phase_no}
        ORDER BY phase_no DESC
        LIMIT 1
        FOR UPDATE;
      `) as any[];
    } else {
      neighRows = (await sql`
        SELECT id, phase_no
        FROM phases
        WHERE (status IS NULL OR status='planned')
          AND phase_no > ${cur.phase_no}
        ORDER BY phase_no ASC
        LIMIT 1
        FOR UPDATE;
      `) as any[];
    }

    const neigh = neighRows?.[0];
    if (!neigh) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'NO_NEIGHBOR' }, { status: 409 });
    }

    // swap phase_no atomically (avoids unique constraint violation)
    await sql`
      UPDATE phases
      SET
        phase_no = CASE
          WHEN id = ${cur.id} THEN ${neigh.phase_no}
          WHEN id = ${neigh.id} THEN ${cur.phase_no}
          ELSE phase_no
        END,
        updated_at = NOW()
      WHERE id IN (${cur.id}, ${neigh.id});
    `;

    await sql`COMMIT`;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    try {
      await sql`ROLLBACK`;
    } catch {}
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}