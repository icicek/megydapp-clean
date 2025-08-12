// getUsdValueFast.ts
import { fetchPriceProxy } from './fetchPriceProxy';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface PriceSource {
  price: number;
  source: string;
}

export interface PriceResult {
  usdValue: number;
  sources: PriceSource[];
  status: 'found' | 'not_found' | 'error';
}

const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 dakika

export default async function getUsdValueFast(
  token: TokenInfo,
  amount: number
): Promise<PriceResult> {
  const key = token.mint;
  const now = Date.now();

  // Cache kontrolü
  const cached = priceCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return {
      usdValue: cached.price * amount,
      sources: [{ price: cached.price, source: 'cache' }],
      status: 'found',
    };
  }

  try {
    // Sadece CoinGecko proxy denemesi
    const price = await fetchPriceProxy({
      mint: token.mint,
      symbol: token.symbol,
    });

    if (price && price > 0) {
      priceCache.set(key, { price, timestamp: now });
      return {
        usdValue: price * amount,
        sources: [{ price, source: 'coingecko' }],
        status: 'found',
      };
    }

    return {
      usdValue: 0,
      sources: [],
      status: 'not_found',
    };
  } catch (err) {
    console.error('❌ getUsdValueFast error:', err);
    return {
      usdValue: 0,
      sources: [],
      status: 'error',
    };
  }
}
