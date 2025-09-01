// app/api/admin/reclassify/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function POST(req: Request) {
  try {
    const header = req.headers.get('x-cron-secret') ?? '';
    const expected = process.env.CRON_SECRET ?? '';
    if (!expected) return NextResponse.json({ ok: false, error: 'server_missing_cron_secret' }, { status: 500 });
    if (!header)  return NextResponse.json({ ok: false, error: 'missing_header' }, { status: 401 });
    if (header !== expected) return NextResponse.json({ ok: false, error: 'bad_secret' }, { status: 401 });

    const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ ok: false, error: 'server_missing_db_url' }, { status: 500 });

    const sql = neon(url);
    const r = await sql/* sql */`SELECT 1 as one;`;

    return NextResponse.json({ ok: true, stage: 'after_db_connect', result: r });
  } catch (err: any) {
    console.error('reclassify POST error (DB test):', err?.message || err);
    return NextResponse.json({ ok: false, error: 'internal_error', message: String(err?.message || err) }, { status: 500 });
  }
}
