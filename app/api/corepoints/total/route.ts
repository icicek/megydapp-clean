// app/api/corepoints/total/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { totalCorePoints } from '@/app/api/_lib/corepoints';

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet') || '';
  if (!wallet) return NextResponse.json({ ok:false, error:'missing wallet' }, { status: 400 });
  const total = await totalCorePoints(wallet);
  return NextResponse.json({ ok: true, total });
}
