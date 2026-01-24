// app/api/admin/phases/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '@/app/api/_lib/jwt';

function asNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim();
    const note = String(body?.note ?? '').trim();

    const pool_megy = asNum(body?.pool_megy);
    const rate_usd_per_megy = asNum(body?.rate_usd_per_megy);
    const target_usd = asNum(body?.target_usd);

    if (!name) {
      return NextResponse.json({ success: false, error: 'NAME_REQUIRED' }, { status: 400 });
    }
    if (pool_megy == null || pool_megy < 0) {
      return NextResponse.json({ success: false, error: 'POOL_INVALID' }, { status: 400 });
    }
    if (rate_usd_per_megy == null || rate_usd_per_megy <= 0) {
      return NextResponse.json({ success: false, error: 'RATE_INVALID' }, { status: 400 });
    }
    if (target_usd != null && target_usd < 0) {
      return NextResponse.json({ success: false, error: 'TARGET_INVALID' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // next phase_no
    const maxRows = await sql`SELECT COALESCE(MAX(phase_no), 0) AS max_no FROM phases;`;
    const nextNo = Number((maxRows as any[])[0]?.max_no ?? 0) + 1;

    const rows = await sql`
      INSERT INTO phases (phase_no, name, note, status, pool_megy, rate_usd_per_megy, target_usd)
      VALUES (${nextNo}, ${name}, ${note || null}, 'planned', ${pool_megy}, ${rate_usd_per_megy}, ${target_usd})
      RETURNING *;
    `;

    return NextResponse.json({ success: true, phase: (rows as any[])[0] ?? null });
  } catch (e: any) {
    console.error('POST /api/admin/phases failed:', e);
    return NextResponse.json(
      { success: false, error: e?.code === '23505' ? 'DUPLICATE' : 'PHASE_CREATE_FAILED' },
      { status: 500 },
    );
  }
}
