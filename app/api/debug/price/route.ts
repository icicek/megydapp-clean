// app/api/debug/price/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getUsdValue from '@/app/api/utils/getUsdValue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const hdr = req.headers.get('x-debug-secret') || req.headers.get('x-cron-secret') || '';
  const secret = process.env.DEBUG_SECRET || process.env.CRON_SECRET || '';
  if (!secret || hdr !== secret) {
    return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
  }

  const q = req.nextUrl.searchParams;
  const mint = (q.get('mint') || q.get('id') || q.get('symbol') || '').trim();
  const amount = Number(q.get('amount') || '1');
  if (!mint) return NextResponse.json({ ok:false, error:'missing_mint' }, { status:400 });

  try {
    const r = await getUsdValue({ mint, symbol: mint }, amount);
    return NextResponse.json({ ok:true, input: mint, result: r });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status:500 });
  }
}
