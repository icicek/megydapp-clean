import { fetchPriceProxy } from './fetchPriceProxy';

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

  try {
    const start = Date.now();
    const price = await fetchPriceProxy({ mint: tokenMint, symbol: token.symbol });
    const elapsed = Date.now() - start;

    console.log(`⏱ [COINGECKO] took ${elapsed}ms`);

    if (price && price > 0) {
      priceCache.set(cacheKey, { price, timestamp: now });

      return {
        usdValue: price * amount,
        sources: [{ price, source: 'coingecko' }],
        status: 'ready',
      };
    }
  } catch (err) {
    console.warn(`⚠️ Error fetching price from Coingecko:`, err);
  }

  return {
    usdValue: 0,
    sources: [],
    status: 'not_found',
  };
}
