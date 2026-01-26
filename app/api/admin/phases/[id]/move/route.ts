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

function toInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
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
    const curRows = (await sql`
      SELECT id, phase_no
      FROM phases
      WHERE id=${id} AND (status IS NULL OR status='planned')
      FOR UPDATE;
    `) as any[];

    const cur = curRows?.[0];
    if (!cur) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'PHASE_NOT_MOVABLE' }, { status: 409 });
    }

    const curNo = toInt(cur.phase_no);
    if (!curNo) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'PHASE_NO_INVALID' }, { status: 409 });
    }

    // neighbor planned phase
    let neighRows: any[] = [];
    if (dir === 'up') {
      neighRows = (await sql`
        SELECT id, phase_no
        FROM phases
        WHERE (status IS NULL OR status='planned')
          AND phase_no < ${curNo}
        ORDER BY phase_no DESC
        LIMIT 1
        FOR UPDATE;
      `) as any[];
    } else {
      neighRows = (await sql`
        SELECT id, phase_no
        FROM phases
        WHERE (status IS NULL OR status='planned')
          AND phase_no > ${curNo}
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

    const neighNo = toInt(neigh.phase_no);
    if (!neighNo) {
      await sql`ROLLBACK`;
      return NextResponse.json({ success: false, error: 'NEIGHBOR_PHASE_NO_INVALID' }, { status: 409 });
    }

    // ✅ EXTRA SAFETY: Eğer DB’de zaten duplicate phase_no varsa burada yakalayalım
    const dupCur = (await sql`
      SELECT COUNT(*)::int AS n
      FROM phases
      WHERE phase_no=${curNo} AND id <> ${cur.id};
    `) as any[];
    const dupNeigh = (await sql`
      SELECT COUNT(*)::int AS n
      FROM phases
      WHERE phase_no=${neighNo} AND id <> ${neigh.id};
    `) as any[];

    if ((dupCur?.[0]?.n ?? 0) > 0 || (dupNeigh?.[0]?.n ?? 0) > 0) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        {
          success: false,
          error: 'PHASE_NO_NOT_UNIQUE',
          details: { curNo, neighNo, dupCur: dupCur?.[0]?.n ?? 0, dupNeigh: dupNeigh?.[0]?.n ?? 0 },
        },
        { status: 409 }
      );
    }

    // ✅ Guaranteed swap using a temporary unique value
    // Choose a temp that cannot collide: negative based on current timestamp
    const tempNo = -1 * Math.trunc(Date.now() / 1000);

    // 1) cur -> temp
    await sql`
      UPDATE phases
      SET phase_no=${tempNo}, updated_at=NOW()
      WHERE id=${cur.id};
    `;

    // 2) neigh -> curNo
    await sql`
      UPDATE phases
      SET phase_no=${curNo}, updated_at=NOW()
      WHERE id=${neigh.id};
    `;

    // 3) cur -> neighNo
    await sql`
      UPDATE phases
      SET phase_no=${neighNo}, updated_at=NOW()
      WHERE id=${cur.id};
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