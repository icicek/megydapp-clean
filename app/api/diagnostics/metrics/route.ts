import { NextRequest, NextResponse } from 'next/server';
import { getLatestMetrics } from '@/app/api/_lib/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get('mint') || '';
  if (!mint) return NextResponse.json({ ok: false, error: 'mint required' }, { status: 400 });

  const m = await getLatestMetrics(mint);
  return NextResponse.json({ ok: true, mint, metrics: m });
}
