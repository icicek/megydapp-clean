// app/api/admin/tokens/bulk/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';

type TokenStatus = 'healthy'|'walking_dead'|'deadcoin'|'redlist'|'blacklist';
const ALLOWED: TokenStatus[] = ['healthy','walking_dead','deadcoin','redlist','blacklist'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);

    const body = await req.json();
    let { mints, status, reason = null, meta = {} } = body || {};

    if (typeof mints === 'string') {
      mints = mints.split(/[\s,]+/g).map((s: string) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json({ success: false, error: 'mints array is required' }, { status: 400 });
    }
    if (!status || !ALLOWED.includes(status)) {
      return NextResponse.json({ success: false, error: 'valid status is required' }, { status: 400 });
    }

    const MAX = 200;
    const uniq = Array.from(new Set<string>(mints));
    if (uniq.length > MAX) {
      return NextResponse.json({ success: false, error: `too many mints (max ${MAX})` }, { status: 400 });
    }

    const ok: { mint: string; status: TokenStatus; statusAt: string }[] = [];
    const fail: { mint: string; error: string }[] = [];

    for (const mint of uniq) {
      try {
        const rows = (await sql`
          INSERT INTO token_registry (mint, status, status_at, updated_by, reason, meta)
          VALUES (${mint}, ${status}::token_status_enum, NOW(), ${admin}, ${reason}, ${meta})
          ON CONFLICT (mint) DO UPDATE
          SET status=${status}::token_status_enum,
              status_at=NOW(),
              updated_by=${admin},
              reason=${reason},
              meta=${meta},
              updated_at=NOW()
          RETURNING mint, status::text AS status, status_at
        `) as unknown as { mint: string; status: TokenStatus; status_at: string }[];

        const r = rows[0];
        ok.push({ mint: r.mint, status: r.status, statusAt: r.status_at });
      } catch (e: any) {
        fail.push({ mint, error: e?.message || 'error' });
      }
    }

    return NextResponse.json({ success: true, okCount: ok.length, failCount: fail.length, ok, fail });
  } catch (e: any) {
    const msg = e?.message || 'bulk error';
    const code = /Missing token|Not allowed|invalid token/i.test(msg) ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status: code });
  }
}
