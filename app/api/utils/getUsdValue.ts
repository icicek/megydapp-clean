import { fetchPriceProxy } from './fetchPriceProxy';
import { fetchRaydiumPrice } from './fetchPriceFromRaydium';
import { fetchJupiterPrice } from './fetchPriceFromJupiter';
import { fetchCMCPrice } from './fetchPriceFromCMC';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface PriceSource {
  price: number;
  source: string;
}

interface PriceResult {
  usdValue: number;
  sources: PriceSource[];
  status: 'ready' | 'not_found' | 'fetching' | 'error';
}

// In-memory cache
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export default async function getUsdValue(token: TokenInfo, amount: number): Promise<PriceResult> {
  const tokenMint = token.mint;
  const cacheKey = `${tokenMint}`;

  const cached = priceCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_DURATION_MS) {
    return {
      usdValue: cached.price * amount,
      sources: [{ price: cached.price, source: 'cache' }],
      status: 'ready',
    };
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
    const start = Date.now();
    try {
      const price = await fn({ mint: tokenMint, symbol: token.symbol });
      const elapsed = Date.now() - start;

      console.log(`⏱ [${name.toUpperCase()}] took ${elapsed}ms`);

      if (price && price > 0) {
        priceCache.set(cacheKey, { price, timestamp: now });

        return {
          usdValue: price * amount,
          sources: [{ price, source: name }],
          status: 'ready',
        };
      }
    } catch (err) {
      console.warn(`⚠️ Error fetching price from ${name}:`, err);
    }
  }

  return {
    usdValue: 0,
    sources: [],
    status: 'not_found',
  };
}
