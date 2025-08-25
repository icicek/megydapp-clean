// app/api/admin/audit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req); // cookie-based JWT

    const { searchParams } = new URL(req.url);
    const mint = searchParams.get('mint');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);

    const rows = (await sql`
      SELECT
        mint,
        old_status::text AS old_status,
        new_status::text AS new_status,
        reason,
        meta,
        updated_by,
        changed_at
      FROM token_audit
      WHERE (${mint ?? null}::text IS NULL OR mint = ${mint})
      ORDER BY changed_at DESC
      LIMIT ${limit}
    `) as unknown as {
      mint: string;
      old_status: string | null;
      new_status: string;
      reason: string | null;
      meta: any;
      updated_by: string | null;
      changed_at: string;
    }[];

    return NextResponse.json({ success: true, items: rows });
  } catch (e: any) {
    const msg = e?.message || 'Internal error';
    const code = /Missing token|Not allowed|invalid token/i.test(msg) ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status: code });
  }
}
