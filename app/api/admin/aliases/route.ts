// app/api/admin/aliases/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { listAliases, upsertAlias, deleteAlias } from '@/app/api/_lib/aliases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/aliases?q=...&limit=...&offset=...
export async function GET(req: NextRequest) {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') || '';
  const limit = Math.max(1, Math.min(200, parseInt(sp.get('limit') || '100', 10)));
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10));
  const items = await listAliases(q, limit, offset);
  return NextResponse.json({ success: true, items });
}

// POST /api/admin/aliases  body: { aliasMint, canonicalMint, note? }
export async function POST(req: NextRequest) {
  verifyCsrf(req);
  await requireAdmin(req);
  const body = await req.json();
  const aliasMint = (body?.aliasMint || '').trim();
  const canonicalMint = (body?.canonicalMint || '').trim();
  const note = (body?.note ?? null) as string | null;

  if (!aliasMint || !canonicalMint) {
    return NextResponse.json({ success: false, error: 'aliasMint and canonicalMint are required' }, { status: 400 });
  }
  await upsertAlias(aliasMint, canonicalMint, note);
  return NextResponse.json({ success: true });
}

// DELETE /api/admin/aliases?alias=...
export async function DELETE(req: NextRequest) {
  verifyCsrf(req);
  await requireAdmin(req);
  const alias = req.nextUrl.searchParams.get('alias');
  if (!alias) {
    return NextResponse.json({ success: false, error: 'alias required' }, { status: 400 });
  }
  await deleteAlias(alias);
  return NextResponse.json({ success: true });
}
