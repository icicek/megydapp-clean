// app/api/admin/tokens/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { sql } from '@/app/api/_lib/db';
import { setStatus as upsertTokenStatus, getStatus as readTokenStatus } from '@/app/api/_lib/token-registry';
import type { TokenStatus } from '@/app/api/_lib/types';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---- helpers ----
const ALLOWED: TokenStatus[] = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'];
function toInt(v: string | null, d: number) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
}

// GET /api/admin/tokens?status=redlist&q=Mi&limit=20&offset=0
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req); // Bearer/JWT

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status');
    const status = (rawStatus && ALLOWED.includes(rawStatus as TokenStatus))
      ? (rawStatus as TokenStatus)
      : null;

    const q = searchParams.get('q');
    const limit = Math.min(Math.max(toInt(searchParams.get('limit'), 20), 1), 100);
    const offset = Math.max(toInt(searchParams.get('offset'), 0), 0);

    // Opsiyonel filtreler
    const pattern = q ? `%${q}%` : null;

    // ✅ YES sayacı için LATERAL alt-sorgu (vote_yes boolean TRUE)
    const rows = (await sql`
      SELECT
        r.mint,
        r.status::text AS status,
        r.status_at,
        r.updated_by,
        r.reason,
        r.meta,
        r.created_at,
        r.updated_at,
        vc.yes_count
      FROM token_registry r
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS yes_count
        FROM deadcoin_votes v
        WHERE v.mint = r.mint AND v.vote_yes = TRUE
      ) vc ON TRUE
      WHERE
        (${status ?? null}::text IS NULL OR r.status::text = ${status})
        AND (${pattern ?? null}::text IS NULL OR r.mint ILIKE ${pattern})
      ORDER BY r.updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as {
      mint: string;
      status: TokenStatus;
      status_at: string | null;
      updated_by: string | null;
      reason: string | null;
      meta: any;
      created_at: string;
      updated_at: string;
      yes_count: number;           // ✅ yeni alan
    }[];

    return NextResponse.json({ success: true, items: rows });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

// POST /api/admin/tokens
// Body: { mint, status, reason?, meta? }
export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req as any);
    const wallet = await requireAdmin(req as any); // JWT içinden admin
    const body = await req.json();
    const { mint, status, reason = null, meta = {} } = body || {};

    if (!mint || !status || !ALLOWED.includes(status)) {
      return NextResponse.json({ success: false, error: 'mint and valid status required' }, { status: 400 });
    }

    await upsertTokenStatus({
      mint,
      newStatus: status as TokenStatus,
      changedBy: wallet,
      reason,
      meta
    });

    const after = await readTokenStatus(mint);
    return NextResponse.json({ success: true, mint, status: after.status, statusAt: after.statusAt });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/admin/tokens?mint=...
// Etki: healthy'e çeker (kayıt yoksa healthy kabul)
export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req as any);
    const wallet = await requireAdmin(req as any);
    const { searchParams } = new URL(req.url);
    const mint = searchParams.get('mint');
    if (!mint) {
      return NextResponse.json({ success: false, error: 'mint required' }, { status: 400 });
    }

    await upsertTokenStatus({
      mint,
      newStatus: 'healthy',
      changedBy: wallet,
      reason: 'reset by admin',
      meta: { via: 'DELETE /api/admin/tokens' }
    });

    const after = await readTokenStatus(mint);
    return NextResponse.json({ success: true, mint, status: after.status, statusAt: after.statusAt });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
