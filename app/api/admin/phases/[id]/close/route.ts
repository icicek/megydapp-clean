// app/api/admin/phases/[id]/close/route.ts
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

    // Only ACTIVE phase can be closed.
    const rows = await sql`
      UPDATE phases
      SET status='completed',
          closed_at=COALESCE(closed_at, NOW()),
          updated_at=NOW()
      WHERE id=${phaseId}
        AND status='active'
      RETURNING *;
    `;

    const phase = (rows as any[])[0] ?? null;
    if (!phase) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_ACTIVE' }, { status: 409 });
    }

    return NextResponse.json({ success: true, phase });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}