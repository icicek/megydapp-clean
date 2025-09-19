import { NextRequest, NextResponse } from 'next/server';
import { getEvmUsdPrice } from '@/lib/pricing/evm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = Number(searchParams.get('chainId') || '0');
    const token = (searchParams.get('token') || '').trim();

    if (!chainId || !token || !token.startsWith('0x')) {
      return NextResponse.json({ error: 'chainId & token (0x...) required' }, { status: 400 });
    }

    const agg = await getEvmUsdPrice(chainId, token as `0x${string}`);
    return NextResponse.json({
      ok: true,
      price: agg.price,
      sources: agg.hits,
      primary: agg.primary,
      updatedAt: agg.primary?.updatedAt ?? Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'price failed' }, { status: 500 });
  }
}
