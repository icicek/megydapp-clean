import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const needSecret = !!process.env.DEBUG_SECRET;
  const provided = (req.headers.get('x-debug-secret') || '').trim();
  if (needSecret && provided !== process.env.DEBUG_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, now: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
