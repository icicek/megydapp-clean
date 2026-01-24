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

    await sql`
      UPDATE phases
      SET status='completed', closed_at=NOW(), updated_at=NOW()
      WHERE status='active' AND id <> ${phaseId};
    `;

    const rows = await sql`
      UPDATE phases
      SET status='active',
          opened_at=COALESCE(opened_at, NOW()),
          updated_at=NOW()
      WHERE id=${phaseId}
      RETURNING *;
    `;

    await sql`COMMIT`;

    return NextResponse.json({ success: true, phase: (rows as any[])[0] ?? null });
  } catch (err: unknown) {
    try { await sql`ROLLBACK`; } catch {}
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}