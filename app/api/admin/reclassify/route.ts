// app/api/admin/reclassify/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
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

  // Sadece "çalışıyor" sinyali
  return NextResponse.json({ ok: true, stage: 'after_auth_only' });
}
