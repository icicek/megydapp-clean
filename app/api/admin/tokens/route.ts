// app/api/admin/tokens/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { sql } from '@/app/api/_lib/db';
import { setStatus as upsertTokenStatus, getStatus as readTokenStatus } from '@/app/api/_lib/token-registry';
import type { TokenStatus } from '@/app/api/_lib/types';
import { verifyCsrf } from '@/app/api/_lib/csrf';

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
    await requireAdmin(req); // Bearer JWT zorunlu

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status');
    const status = (rawStatus && ALLOWED.includes(rawStatus as TokenStatus))
      ? (rawStatus as TokenStatus)
      : null;

    const q = searchParams.get('q');
    const limit = Math.min(Math.max(toInt(searchParams.get('limit'), 20), 1), 100);
    const offset = Math.max(toInt(searchParams.get('offset'), 0), 0);

    // Opsiyonel filtreleri "OR param IS NULL" kalıbıyla çözüyoruz;
    // Böylece tek bir tagged template ile güvenli parametreleme yapılıyor.
    const pattern = q ? `%${q}%` : null;

    const rows = (await sql`
      SELECT
        mint,
        status::text AS status,
        status_at,
        updated_by,
        reason,
        meta,
        created_at,
        updated_at
      FROM token_registry
      WHERE
        (${status ?? null}::text IS NULL OR status::text = ${status})
        AND (${pattern ?? null}::text IS NULL OR mint ILIKE ${pattern})
      ORDER BY updated_at DESC
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
    }[];

    return NextResponse.json({ success: true, items: rows });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// POST /api/admin/tokens
// Body: { mint, status, reason?, meta? }
export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    const wallet = await requireAdmin(req); // JWT içinden admin
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
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

// DELETE /api/admin/tokens?mint=...
// Etki: healthy'e çeker (kayıt yoksa healthy kabul)
export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    const wallet = await requireAdmin(req);
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
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
