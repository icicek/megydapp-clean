// app/api/debug/health/route.ts
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';         // ENV erişimi problemsiz

function tscEqual(a: string, b: string) {
  // Constant-time compare (kısa ve pratik)
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function GET(req: NextRequest) {
  const want = process.env.DEBUG_SECRET || '';
  if (!want) {
    return NextResponse.json({ ok: false, error: 'server-misconfig' }, { status: 500 });
  }

  const h = req.headers.get('x-debug-secret')?.trim() || '';
  const q = new URL(req.url).searchParams.get('secret')?.trim() || '';
  const got = h || q; // header öncelikli, yoksa query kabul

  if (!got || !tscEqual(got, want)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, now: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
