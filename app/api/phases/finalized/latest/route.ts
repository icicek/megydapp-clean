// app/api/phases/finalized/latest/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, snapshot_taken_at, status_v2
      FROM phases
      WHERE snapshot_taken_at IS NOT NULL
        AND LOWER(COALESCE(status_v2, '')) = 'finalized'
      ORDER BY snapshot_taken_at DESC
      LIMIT 1
    `;

    const phase = (rows as any[])[0];

    if (!phase?.id) {
      return NextResponse.json(
        { success: false, error: 'NO_FINALIZED_PHASE' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      phase_id: Number(phase.id),
      snapshot_taken_at: phase.snapshot_taken_at,
      status_v2: phase.status_v2,
    });
  } catch (e: any) {
    console.error('[phases/finalized/latest] error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
