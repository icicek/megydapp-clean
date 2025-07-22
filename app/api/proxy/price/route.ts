import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { source, params } = await req.json();

    if (!source) {
      return NextResponse.json({ success: false, error: 'Source is required' }, { status: 400 });
    }

    let apiUrl = '';

    if (source === 'coingecko') {
      const { isSol, mint } = params;
      apiUrl = isSol
        ? 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
        : `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${mint}&vs_currencies=usd`;
    } else {
      return NextResponse.json({ success: false, error: 'Unsupported source' }, { status: 400 });
    }

    const response = await fetch(apiUrl);
    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Fetch failed with status ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('❌ Proxy fetch error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
