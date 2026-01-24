// app/api/admin/phases/[id]/close/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

export async function POST(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const phaseId = Number(ctx?.params?.id);
    if (!Number.isFinite(phaseId) || phaseId <= 0) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    await sql`BEGIN`;
    try {
      const rows = (await sql/* sql */`
        UPDATE phases
        SET status='completed',
            closed_at=COALESCE(closed_at, NOW()),
            updated_at=NOW()
        WHERE id=${phaseId}
        RETURNING *
      `) as any[];

      await sql`COMMIT`;
      return NextResponse.json({ success: true, phase: rows?.[0] ?? null });
    } catch (e) {
      await sql`ROLLBACK`;
      throw e;
    }
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
