import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { source, params } = await req.json();

    console.log('📥 [proxy] Incoming request:', { source, params });

    if (!source) {
      return NextResponse.json(
        { success: false, error: 'Source is required' },
        { status: 400 }
      );
    }

    let apiUrl = '';
    let isSol = false;

    if (source === 'coingecko') {
      const { mint } = params;
      isSol = params.isSol;

      apiUrl = isSol
        ? 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
        : `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${mint}&vs_currencies=usd`;
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported source' },
        { status: 400 }
      );
    }

    console.log('🌍 [proxy] Fetching from:', apiUrl);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.warn('❌ [proxy] Failed with status:', response.status);
      return NextResponse.json(
        { success: false, error: `Fetch failed with status ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('📦 [proxy] Response data:', data);

    // 🔎 Extract price from CoinGecko response
    let price: number | null = null;

    if (source === 'coingecko') {
      if (isSol) {
        price = data?.solana?.usd ?? null;
      } else {
        const mintLower = params.mint.toLowerCase();
        price = data?.[mintLower]?.usd ?? null;
      }
    }

    console.log('✅ [proxy] Parsed price:', price);

    return NextResponse.json({
      success: true,
      data,
      price,
    });
  } catch (err: any) {
    console.error('🔥 [proxy] Error occurred:', err.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
