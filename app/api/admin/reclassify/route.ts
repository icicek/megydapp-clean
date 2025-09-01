export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function GET() {
  // Sadece varlık testi için (HEAD/GET 200 döndürür)
  return NextResponse.json({ ok: true, route: '/api/admin/reclassify' });
}

export async function POST(req: Request) {
  const key = req.headers.get('x-cron-secret') ?? '';
  const expected = process.env.CRON_SECRET ?? '';
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'server_missing_cron_secret' }, { status: 500 });
  }
  if (!key) {
    return NextResponse.json({ ok: false, error: 'missing_header' }, { status: 401 });
  }
  if (key !== expected) {
    return NextResponse.json({ ok: false, error: 'bad_secret' }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
