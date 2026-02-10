// app/api/admin/phases/[id]/assign-unassigned/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '@/app/api/_lib/jwt';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

function asInt(x: string | null): number | null {
  if (!x) return null;
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    await requireAdmin(req);

    const phaseId = asInt(ctx?.params?.id ?? null);
    if (!phaseId) {
      return NextResponse.json({ success: false, error: 'INVALID_PHASE_ID' }, { status: 400 });
    }

    // phase bilgisi
    const phaseRows = await sql/* sql */`
      SELECT id, phase_no, status
      FROM phases
      WHERE id = ${phaseId}
      LIMIT 1;
    `;
    if (!phaseRows?.length) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
    }
    const phase = phaseRows[0] as any;

    // güvenli taşıma: TX
    const result = await sql/* sql */`
      WITH moved AS (
        UPDATE contributions
           SET phase_id        = ${phaseId},
               alloc_phase_no  = ${Number(phase.phase_no)},
               alloc_status    = 'pending',
               alloc_updated_at= NOW()
         WHERE phase_id IS NULL
         RETURNING id
      )
      SELECT COUNT(*)::int AS moved_count FROM moved;
    `;

    return NextResponse.json({
      success: true,
      phase: { id: Number(phase.id), phase_no: Number(phase.phase_no), status: String(phase.status || '') },
      moved_count: Number((result?.[0] as any)?.moved_count ?? 0),
    });
  } catch (e: any) {
    console.error('assign-unassigned failed:', e?.message || e);
    const code = String(e?.code || '');
    const status = code === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ success: false, error: e?.message || 'INTERNAL_ERROR' }, { status });
  }
}
