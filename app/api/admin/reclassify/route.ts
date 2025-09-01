// app/api/admin/reclassify/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { httpErrorFrom } from '@/app/api/_lib/http';

type Sql = ReturnType<typeof neon>;

async function tryImportReclassifyAll():
  Promise<null | ((sql: Sql, opts?: { force?: boolean }) => Promise<any>)> {
  try {
    const mod: any = await import('./reclassifyAll');
    return typeof mod?.reclassifyAll === 'function' ? mod.reclassifyAll : null;
  } catch { return null; }
}

export async function POST(req: Request) {
  try {
    // Auth
    const header = req.headers.get('x-cron-secret') ?? '';
    const expected = process.env.CRON_SECRET ?? '';
    if (!expected) return NextResponse.json({ ok:false, error:'server_missing_cron_secret' }, { status:500 });
    if (!header)  return NextResponse.json({ ok:false, error:'missing_header' }, { status:401 });
    if (header !== expected) return NextResponse.json({ ok:false, error:'bad_secret' }, { status:401 });

    // DB
    const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ ok:false, error:'server_missing_db_url' }, { status:500 });
    const sql = neon(url);

    // force bayrağı
    const u = new URL(req.url);
    const force = req.headers.get('x-cron-force') === '1' || u.searchParams.get('force') === '1';

    // iş mantığı
    const reclassifyAll = await tryImportReclassifyAll();
    if (!reclassifyAll) return NextResponse.json({ ok:true, stage:'no_impl', skipped:true, reason:'no_reclassify_impl' });

    const result = await reclassifyAll(sql, { force });
    return NextResponse.json({ ok:true, stage:'after_reclassify', ...result });
  } catch (err: any) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json({ ok:false, ...body }, { status });
  }
}
