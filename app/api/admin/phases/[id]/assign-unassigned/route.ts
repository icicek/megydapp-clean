// app/api/admin/phases/[id]/assign-unassigned/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAdmin(req as any);

  const phaseId = Number(params.id);
  if (!Number.isFinite(phaseId) || phaseId <= 0) {
    return NextResponse.json(
      { success: false, error: 'BAD_PHASE_ID' },
      { status: 400 }
    );
  }

  await sql`BEGIN`;

  try {
    const moved = (await sql`
      UPDATE contributions
      SET
        phase_id = ${phaseId},
        alloc_phase_no = (SELECT phase_no FROM phases WHERE id = ${phaseId}),
        alloc_status = 'pending',
        alloc_updated_at = NOW()
      WHERE phase_id IS NULL
        AND COALESCE(alloc_status, 'unassigned') = 'unassigned'
      RETURNING id
    `) as any[];

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      moved: moved.length,
    });
  } catch (e) {
    await sql`ROLLBACK`;
    throw e;
  }
}
