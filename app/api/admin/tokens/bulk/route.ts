// app/api/admin/tokens/bulk/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { cache, statusKey } from '@/app/api/_lib/cache';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { httpErrorFrom } from '@/app/api/_lib/http';

type TokenStatus = 'healthy'|'walking_dead'|'deadcoin'|'redlist'|'blacklist';
const ALLOWED: TokenStatus[] = ['healthy','walking_dead','deadcoin','redlist','blacklist'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    verifyCsrf(req as any);
    const admin = await requireAdmin(req as any); // keep your existing admin (string or wallet id)

    const body = await req.json();
    let { mints, status, reason = null, meta = {} } = body || {};

    // --- normalize mints
    if (typeof mints === 'string') {
      mints = mints.split(/[\s,;]+/g).map((s: string) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json({ success: false, error: 'mints array is required' }, { status: 400 });
    }
    if (!status || !ALLOWED.includes(status)) {
      return NextResponse.json({ success: false, error: 'valid status is required' }, { status: 400 });
    }

    // --- meta may be JSON string or object; ensure jsonb
    let metaObj: any = {};
    if (typeof meta === 'string') {
      try {
        metaObj = meta.trim() ? JSON.parse(meta) : {};
      } catch {
        return NextResponse.json({ success: false, error: 'meta must be valid JSON' }, { status: 400 });
      }
    } else if (meta && typeof meta === 'object') {
      metaObj = meta;
    }

    const MAX = 200;
    const uniq = Array.from(new Set<string>(mints));
    if (uniq.length > MAX) {
      return NextResponse.json({ success: false, error: `too many mints (max ${MAX})` }, { status: 400 });
    }

    const ok: { mint: string; status: TokenStatus; statusAt: string }[] = [];
    const fail: { mint: string; error: string }[] = [];

    // --- single transaction to keep audit + registry consistent
    await sql`BEGIN`;
    try {
      for (const mint of uniq) {
        try {
          // fetch old status (for audit)
          const prev = (await sql`
            SELECT status::text AS status
            FROM token_registry
            WHERE mint = ${mint}
          `) as unknown as { status: TokenStatus }[];

          const oldStatus: TokenStatus | null = prev[0]?.status ?? null;

          // upsert registry
          const rows = (await sql`
            INSERT INTO token_registry (mint, status, status_at, updated_by, reason, meta)
            VALUES (
              ${mint},
              ${status}::token_status_enum,
              NOW(),
              ${admin},
              ${reason},
              ${JSON.stringify(metaObj)}::jsonb
            )
            ON CONFLICT (mint) DO UPDATE
            SET status=${status}::token_status_enum,
                status_at=NOW(),
                updated_by=${admin},
                reason=${reason},
                meta=${JSON.stringify(metaObj)}::jsonb,
                updated_at=NOW()
            RETURNING mint, status::text AS status, status_at
          `) as unknown as { mint: string; status: TokenStatus; status_at: string }[];

          const r = rows[0];
          ok.push({ mint: r.mint, status: r.status, statusAt: r.status_at });

          // write audit (old -> new)
          await sql`
            INSERT INTO token_audit (mint, old_status, new_status, reason, meta, updated_by, updated_at)
            VALUES (
              ${mint},
              ${oldStatus},
              ${status}::token_status_enum,
              ${reason},
              ${JSON.stringify(metaObj)}::jsonb,
              ${admin},
              NOW()
            )
          `;

          // cache invalidation for this mint
          cache.del(statusKey(mint));
        } catch (e: any) {
          fail.push({ mint, error: e?.message || 'error' });
        }
      }
      await sql`COMMIT`;
    } catch (txErr) {
      await sql`ROLLBACK`;
      throw txErr;
    }

    return NextResponse.json({ success: true, okCount: ok.length, failCount: fail.length, ok, fail });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
