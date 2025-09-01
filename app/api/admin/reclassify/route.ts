// app/api/admin/reclassify/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

// reclassifyAll varsa (./reclassifyAll.ts), onu dinamik içeri aktar.
// yoksa sadece heartbeat atıp "skipped" döneceğiz.
async function getReclassifyAll():
  Promise<null | ((sql: any) => Promise<any>)> {
  try {
    const mod: any = await import('./reclassifyAll');
    return typeof mod?.reclassifyAll === 'function' ? mod.reclassifyAll : null;
  } catch {
    return null;
  }
}

/** İstersen bu GET'i sonra kaldırabilirsin; sağlık kontrolü için bırakıyorum. */
export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/admin/reclassify' });
}

export async function POST(req: Request) {
  const header = req.headers.get('x-cron-secret') ?? '';
  const expected = process.env.CRON_SECRET ?? '';

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'server_missing_cron_secret' },
      { status: 500 },
    );
  }
  if (!header) {
    return NextResponse.json(
      { ok: false, error: 'missing_header' },
      { status: 401 },
    );
  }
  if (header !== expected) {
    return NextResponse.json(
      { ok: false, error: 'bad_secret' },
      { status: 401 },
    );
  }

  // Heartbeat tablosu (ilk çalıştırmada oluşturur)
  await sql/* sql */`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id serial PRIMARY KEY,
      ran_at timestamptz NOT NULL DEFAULT now(),
      note text
    );
  `;

  const reclassifyAll = await getReclassifyAll();

  if (reclassifyAll) {
    // asıl işi çalıştır (işlev kendi audit/cron notlarını yazabilir)
    const result = await reclassifyAll(sql);
    if (result?.skipped) {
      await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`skip: ${result.reason ?? 'unknown'}`});`;
    }
    return NextResponse.json({ ok: true, ...result });
  } else {
    // fallback: yalnızca heartbeat
    await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('ok: heartbeat');`;
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_reclassify_impl' });
  }
}
