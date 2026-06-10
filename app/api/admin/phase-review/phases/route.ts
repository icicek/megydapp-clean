//app/api/admin/phase-review/phases/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, HttpError } from '@/app/api/_lib/jwt';
import { sql } from '@/app/api/_lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const rows = await sql`
      SELECT
        id AS phase_id,
        phase_no,
        name,
        status
      FROM phases
      WHERE status IN ('active', 'reviewing')
      ORDER BY phase_no DESC, id DESC
    `;

    return NextResponse.json({
      success: true,
      phases: rows ?? [],
    });
  } catch (err: any) {
    console.error('admin phase review phases failed:', err);

    if (err instanceof HttpError) {
      return NextResponse.json(
        { success: false, error: err.code || 'AUTH_ERROR' },
        { status: err.status }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}