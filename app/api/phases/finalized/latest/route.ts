//app/api/phases/finalized/latest/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';

export async function GET() {
  try {
    const rows = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        name,
        status,
        snapshot_taken_at,
        finalized_at
      FROM phases
      WHERE snapshot_taken_at IS NOT NULL
        AND finalized_at IS NOT NULL
      ORDER BY finalized_at DESC, phase_no DESC, id DESC
      LIMIT 1
    `) as any[];

    const phase = rows?.[0] ?? null;

    if (!phase?.id) {
      return NextResponse.json(
        { success: false, error: 'NO_FINALIZED_PHASE' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      phase_id: Number(phase.id),
      phase_no: Number(phase.phase_no ?? 0),
      name: String(phase.name || ''),
      status: String(phase.status || ''),
      snapshot_taken_at: phase.snapshot_taken_at ?? null,
      finalized_at: phase.finalized_at ?? null,
    });
  } catch (e: any) {
    console.error('[phases/finalized/latest] error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}