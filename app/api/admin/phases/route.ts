// app/api/admin/phases/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

/*
ADMIN PHASE CREATE ROUTE

Purpose:
- create a new planned phase

Business rule:
- a newer phase must NOT have a better (lower) rate than the previous phase
- therefore:
    new rate >= previous phase rate
*/

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
      return NextResponse.json(
        { success: false, error: 'NAME_REQUIRED' },
        { status: 400 }
      );
    }

    if (pool_megy == null || pool_megy <= 0) {
      return NextResponse.json(
        { success: false, error: 'POOL_INVALID' },
        { status: 400 }
      );
    }

    if (rate_usd_per_megy == null || rate_usd_per_megy <= 0) {
      return NextResponse.json(
        { success: false, error: 'RATE_INVALID' },
        { status: 400 }
      );
    }

    await sql`BEGIN`;

    // 1) Find current max phase_no
    const maxRows = (await sql/* sql */`
      SELECT COALESCE(MAX(phase_no), 0) AS max_no
      FROM phases
      FOR UPDATE
    `) as any[];

    const nextNo = Number(maxRows?.[0]?.max_no ?? 0) + 1;

    // 2) Find previous phase (highest phase_no)
    const prevRows = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        name,
        COALESCE(rate_usd_per_megy, rate, 0)::numeric AS prev_rate
      FROM phases
      ORDER BY phase_no DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `) as any[];

    const prev = prevRows?.[0] ?? null;
    const prevRate = prev ? Number(prev.prev_rate ?? 0) : null;

    // 3) Business rule:
    // new phase cannot be more advantageous than previous phase
    // therefore new rate must be >= previous rate
    if (
      prev &&
      Number.isFinite(prevRate) &&
      prevRate != null &&
      prevRate > 0 &&
      rate_usd_per_megy < prevRate
    ) {
      await sql`ROLLBACK`;

      return NextResponse.json(
        {
          success: false,
          error: 'RATE_TOO_GOOD_VS_PREVIOUS',
          message:
            'New phase rate cannot be lower than the previous phase rate.',
          previous: {
            phase_id: Number(prev.id),
            phase_no: Number(prev.phase_no),
            name: String(prev.name || ''),
            rate_usd_per_megy: prevRate,
          },
          incoming: {
            phase_no: nextNo,
            rate_usd_per_megy,
          },
        },
        { status: 409 }
      );
    }

    // 4) Create planned phase
    const rows = (await sql/* sql */`
      INSERT INTO phases (
        phase_no,
        name,
        status,
        pool_megy,
        rate_usd_per_megy,
        created_at,
        updated_at
      )
      VALUES (
        ${nextNo},
        ${name},
        'planned',
        ${pool_megy},
        ${rate_usd_per_megy},
        NOW(),
        NOW()
      )
      RETURNING *
    `) as any[];

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      phase: rows?.[0] ?? null,
      message: 'Phase created successfully.',
    });
  } catch (err: unknown) {
    try {
      await sql`ROLLBACK`;
    } catch {}

    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}