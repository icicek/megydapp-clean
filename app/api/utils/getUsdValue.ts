import { fetchPriceProxy } from './fetchPriceProxy';
import { fetchRaydiumPrice } from './fetchPriceFromRaydium';
import { fetchJupiterPrice } from './fetchPriceFromJupiter';
import { fetchCMCPrice } from './fetchPriceFromCMC';

export default async function getUsdValue(
  token: { mint: string; symbol?: string },
  amount: number
): Promise<{
  usdValue: number;
  sources: { price: number; source: string }[];
  status: 'ready' | 'not_found' | 'fetching' | 'error';
}> {
  const tokenMint = token.mint;
  const tokenSymbol = token.symbol;
  const cacheKey = `price-${tokenMint}`;

  // 1️⃣ Önce localStorage'da var mı kontrol et
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        const age = now - parsed.timestamp;
        if (age < 5 * 60 * 1000) {
          console.log('⚡ Price served from localStorage cache');
          return {
            usdValue: parsed.price * amount,
            sources: [{ price: parsed.price, source: 'localStorage' }],
            status: 'ready',
          };
        } else {
          localStorage.removeItem(cacheKey);
        }
      } catch (e) {
        console.warn('❌ localStorage parse error:', e);
      }
    }
  }

  const sources: {
    fn: (token: { mint: string; symbol?: string }) => Promise<number | null>;
    name: string;
  }[] = [
    { fn: fetchPriceProxy, name: 'coingecko' },
    { fn: fetchRaydiumPrice, name: 'raydium' },
    { fn: fetchJupiterPrice, name: 'jupiter' },
    { fn: fetchCMCPrice, name: 'cmc' },
  ];

  for (const { fn, name } of sources) {
    try {
      const price = await fn({ mint: tokenMint, symbol: tokenSymbol });
      if (price && price > 0) {
        console.log(`✅ Price found from ${name}: $${price}`);

        // 2️⃣ Bulunan fiyatı localStorage'a kaydet
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              price,
              timestamp: Date.now(),
            })
          );
        }

        return {
          usdValue: price * amount,
          sources: [{ price, source: name }],
          status: 'ready',
        };
      }
    } catch (err) {
      console.error(`❌ Error fetching price from ${name}:`, err);
    }
  }

  console.warn('⚠️ Price not found from any source');
  return {
    usdValue: 0,
    sources: [],
    status: 'not_found',
  };
}
