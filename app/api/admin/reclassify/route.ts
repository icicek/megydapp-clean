// app/api/admin/reclassify/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

type Sql = ReturnType<typeof neon>;

async function tryImportReclassifyAll():
  Promise<null | ((sql: Sql, opts?: { force?: boolean }) => Promise<any>)> {
  try {
    const mod: any = await import('./reclassifyAll');
    return typeof mod?.reclassifyAll === 'function' ? mod.reclassifyAll : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    // 1) Auth
    const header = req.headers.get('x-cron-secret') ?? '';
    const expected = process.env.CRON_SECRET ?? '';
    if (!expected) return NextResponse.json({ ok: false, error: 'server_missing_cron_secret' }, { status: 500 });
    if (!header)  return NextResponse.json({ ok: false, error: 'missing_header' }, { status: 401 });
    if (header !== expected) return NextResponse.json({ ok: false, error: 'bad_secret' }, { status: 401 });

    // 2) DB
    const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ ok: false, error: 'server_missing_db_url' }, { status: 500 });
    const sql = neon(url);

    // 3) Force bayrağı (header veya query ile)
    const u = new URL(req.url);
    const force =
      req.headers.get('x-cron-force') === '1' ||
      u.searchParams.get('force') === '1';

    // 4) reclassify
    const reclassifyAll = await tryImportReclassifyAll();
    if (!reclassifyAll) {
      return NextResponse.json({ ok: true, stage: 'no_impl', skipped: true, reason: 'no_reclassify_impl' });
    }
    const result = await reclassifyAll(sql, { force });

    return NextResponse.json({ ok: true, stage: 'after_reclassify', ...result });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const name = String(err?.code || err?.name || 'INTERNAL');
    console.error('reclassify POST error:', name, msg);
    return NextResponse.json({ ok: false, error: 'internal_error', code: name, message: msg }, { status: 500 });
  }
}
