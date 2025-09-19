// app/api/price/native/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getNativeUsdUnitPrice } from '@/lib/pricing/native';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = Number(searchParams.get('chainId') || '0');
    if (!chainId) {
      return NextResponse.json({ ok: false, error: 'chainId required' }, { status: 400 });
    }
    const agg = await getNativeUsdUnitPrice(chainId);
    return NextResponse.json({
      ok: true,
      price: agg.price,       // 1 native = X USD
      sources: agg.hits,      // list of hits
      primary: agg.primary,   // selected source
      updatedAt: agg.primary?.updatedAt ?? Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'native price failed' }, { status: 500 });
  }
}
