export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    await requireAdmin(req as any);
    const phaseId = Number(ctx.params.id);
    if (!Number.isFinite(phaseId) || phaseId <= 0) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    await sql`BEGIN`;

    // Close any active (override)
    await sql/* sql */`
      UPDATE phases
      SET status='completed', closed_at=COALESCE(closed_at, NOW()), updated_at=NOW()
      WHERE status='active' AND id <> ${phaseId};
    `;

    // Open target
    const rows = (await sql/* sql */`
      UPDATE phases
      SET status='active', opened_at=COALESCE(opened_at, NOW()), updated_at=NOW()
      WHERE id=${phaseId}
      RETURNING *;
    `) as any[];

    await sql`COMMIT`;

    return NextResponse.json({ success: true, phase: rows?.[0] ?? null });
  } catch (err: unknown) {
    try { await sql`ROLLBACK`; } catch {}
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}