// app/api/admin/phases/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

function asNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim();

    const pool_megy = asNum(body?.pool_megy);
    const rate_usd_per_megy = asNum(body?.rate_usd_per_megy);

    if (!name) {
      return NextResponse.json({ success: false, error: 'NAME_REQUIRED' }, { status: 400 });
    }
    if (pool_megy == null || pool_megy <= 0) {
      return NextResponse.json({ success: false, error: 'POOL_INVALID' }, { status: 400 });
    }
    if (rate_usd_per_megy == null || rate_usd_per_megy <= 0) {
      return NextResponse.json({ success: false, error: 'RATE_INVALID' }, { status: 400 });
    }

    // next phase_no
    const maxRows = (await sql`
      SELECT COALESCE(MAX(phase_no), 0) AS max_no
      FROM phases;
    `) as any[];

    const nextNo = Number(maxRows?.[0]?.max_no ?? 0) + 1;

    // IMPORTANT:
    // - target_usd DB'de GENERATED ALWAYS (pool_megy * rate_usd_per_megy) → asla insert etmiyoruz.
    // - note kolonu DB'de yok → asla insert etmiyoruz.
    const rows = await sql`
      INSERT INTO phases (phase_no, name, status, pool_megy, rate_usd_per_megy, created_at, updated_at)
      VALUES (${nextNo}, ${name}, 'planned', ${pool_megy}, ${rate_usd_per_megy}, NOW(), NOW())
      RETURNING *;
    `;

    return NextResponse.json({ success: true, phase: (rows as any[])[0] ?? null });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}