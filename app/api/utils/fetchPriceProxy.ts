export async function fetchPriceProxy(token: { mint: string; symbol?: string }): Promise<number | null> {
  try {
    const isSol = token.symbol?.toUpperCase() === 'SOL' || token.mint === 'So11111111111111111111111111111111111111112';

    const res = await fetch('/api/proxy/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'coingecko',
        params: { isSol, mint: token.mint },
      }),
    });

    const json = await res.json();

    if (!json.success) {
      console.warn('❌ Proxy price fetch failed:', json.error);
      return null;
    }

    if (isSol) {
      return json.data.solana?.usd ?? null;
    }

    const priceData = Object.values(json.data)[0];
    if (priceData && typeof priceData === 'object' && 'usd' in priceData) {
      return (priceData as any).usd;
    }

    console.warn('❌ USD price not found in proxy response data');
    return null;

  } catch (err) {
    console.error('❌ Error in fetchPriceViaProxy:', err);
    return null;
  }
}
