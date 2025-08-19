// app/api/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getStatus, setStatus, TokenStatus } from '@/app/api/list/repo';

export async function GET(req: NextRequest) {
  try {
    const mint = req.nextUrl.searchParams.get('mint');
    if (!mint) return NextResponse.json({ success: false, error: 'mint is required' }, { status: 400 });
    const res = await getStatus(mint);
    return NextResponse.json({ success: true, ...res });
  } catch (e:any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, status, reason = null, source = 'manual', force = false, meta = {} } = body || {};
    const allowed: TokenStatus[] = ['healthy','walking_dead','deadcoin','redlist','blacklist'];
    if (!mint || !status || !allowed.includes(status)) {
      return NextResponse.json({ success: false, error: 'mint and valid status required' }, { status: 400 });
    }
    const res = await setStatus(mint, status, { reason, source, force, meta });
    return NextResponse.json({ success: true, ...res });
  } catch (e:any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
