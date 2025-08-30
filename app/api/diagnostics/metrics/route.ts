// app/api/diagnostics/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getLatestMetrics } from '@/app/api/_lib/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get('mint')?.trim();
  if (!mint) {
    return NextResponse.json({ ok: false, error: 'mint required' }, { status: 400 });
  }
  try {
    const metrics = await getLatestMetrics(mint);
    return NextResponse.json({ ok: true, mint, metrics });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'internal error' }, { status: 500 });
  }
}
