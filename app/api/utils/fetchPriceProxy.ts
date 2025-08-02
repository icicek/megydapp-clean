// app/api/utils/fetchPriceProxy.ts

export async function fetchPriceProxy(token: { mint: string; symbol?: string }): Promise<number | null> {
  console.log(`🚀 [Proxy] Starting price fetch for token: ${token.mint} (${token.symbol})`);

  const url = `https://proxy.megydapp.vercel.app/api/coingecko-price?mint=${token.mint}`;
  console.log(`🌐 [Proxy] Request URL: ${url}`);

  try {
    console.time('⏱️ Coingecko Fetch Duration');
    const response = await fetch(url);
    console.timeEnd('⏱️ Coingecko Fetch Duration');

    if (!response.ok) {
      console.warn(`❌ [Proxy] Fetch failed with status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log('📦 [Proxy] Response data:', data);

    if (data && typeof data.price === 'number') {
      console.log(`✅ [Proxy] Price found: $${data.price}`);
      return data.price;
    } else {
      console.warn('⚠️ [Proxy] Price not found in response.');
      return null;
    }
  } catch (error) {
    console.error('🔥 [Proxy] Fetch error:', error);
    return null;
  }
}
