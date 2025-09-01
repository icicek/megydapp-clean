// app/api/admin/reclassify/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

type Sql = ReturnType<typeof neon>;

// Lazy init: DB client'ı modül tepesinde değil, POST içinde kuruyoruz
function getSql(): Sql {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw Object.assign(new Error('server_missing_db_url'), { code: 'SERVER_MISSING_DB_URL' });
  }
  return neon(url);
}

async function tryImportReclassifyAll():
  Promise<null | ((sql: Sql) => Promise<any>)> {
  try {
    const mod: any = await import('./reclassifyAll');
    return typeof mod?.reclassifyAll === 'function' ? mod.reclassifyAll : null;
  } catch {
    return null;
  }
}

/** Opsiyonel sağlık testi */
export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/admin/reclassify' });
}

export async function POST(req: Request) {
  try {
    // 1) Auth
    const header = req.headers.get('x-cron-secret') ?? '';
    const expected = process.env.CRON_SECRET ?? '';
    if (!expected) {
      return NextResponse.json({ ok: false, error: 'server_missing_cron_secret' }, { status: 500 });
    }
    if (!header) {
      return NextResponse.json({ ok: false, error: 'missing_header' }, { status: 401 });
    }
    if (header !== expected) {
      return NextResponse.json({ ok: false, error: 'bad_secret' }, { status: 401 });
    }

    // 2) DB bağlan
    const sql = getSql();

    // 3) Heartbeat tablosu
    await sql/* sql */`
      CREATE TABLE IF NOT EXISTS cron_runs (
        id serial PRIMARY KEY,
        ran_at timestamptz NOT NULL DEFAULT now(),
        note text
      );
    `;

    // 4) Reclassify mantığını dene (varsa)
    const reclassifyAll = await tryImportReclassifyAll();
    if (reclassifyAll) {
      const result = await reclassifyAll(sql);
      if (result?.skipped) {
        await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`skip: ${result.reason ?? 'unknown'}`});`;
      } else {
        await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`ok: processed=${result?.processed ?? 0}, changed=${result?.changed ?? 0}`});`;
      }
      return NextResponse.json({ ok: true, ...result });
    } else {
      // 5) Sadece heartbeat
      await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('ok: heartbeat');`;
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_reclassify_impl' });
    }
  } catch (err: any) {
    // Hata mesajını görünür yap (gizli bilgi sızdırmadan)
    const code = err?.code || err?.name || 'INTERNAL';
    const msg  = String(err?.message || err);
    console.error('reclassify POST error:', code, msg);
    return NextResponse.json({ ok: false, error: 'internal_error', code, message: msg }, { status: 500 });
  }
}
