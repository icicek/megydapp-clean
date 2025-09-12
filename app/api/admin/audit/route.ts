// app/api/admin/audit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TokenStatus = 'healthy'|'walking_dead'|'deadcoin'|'redlist'|'blacklist';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req); // cookie-based JWT

    const { searchParams } = new URL(req.url);
    const source = (searchParams.get('source') || 'token').toLowerCase(); // 🔁 backward-compat: 'token'
    const mint = searchParams.get('mint');
    const adminWallet = searchParams.get('admin_wallet');
    const action = searchParams.get('action');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);

    if (source === 'admin') {
      // ✅ NEW: admin_audit
      const rows = (await sql`
        SELECT
          id,
          ts,
          admin_wallet,
          action,
          target_mint,
          prev_status::text AS prev_status,
          new_status::text AS new_status,
          ip,
          ua,
          extra
        FROM admin_audit
        WHERE (${mint ?? null}::text IS NULL OR target_mint = ${mint})
          AND (${adminWallet ?? null}::text IS NULL OR admin_wallet = ${adminWallet})
          AND (${action ?? null}::text IS NULL OR action = ${action})
        ORDER BY ts DESC
        LIMIT ${limit}
      `) as unknown as {
        id: number;
        ts: string;
        admin_wallet: string;
        action: string;
        target_mint: string | null;
        prev_status: TokenStatus | null;
        new_status: TokenStatus | null;
        ip: string | null;
        ua: string | null;
        extra: any;
      }[];

      return NextResponse.json({ success: true, source: 'admin', items: rows });
    }

    // ♻️ OLD: token_audit (mevcut davranışı koru)
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

    return NextResponse.json({ success: true, source: 'token', items: rows });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
