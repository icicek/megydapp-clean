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

export interface PriceResult {
  usdValue: number;
  sources: PriceSource[];
  status: 'ready' | 'not_found' | 'fetching' | 'error';
}

const priceCache = new Map<
  string,
  { price: number; source: string; timestamp: number }
>();

const CACHE_TTL = 1000 * 60 * 5; // 5 dakika

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), ms);
    promise
      .then((res) => {
        clearTimeout(timeout);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

export default async function getUsdValue(
  token: TokenInfo,
  amount: number
): Promise<PriceResult> {
  const key = token.mint;
  const now = Date.now();

  // ✅ Use cache if available
  const cached = priceCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return {
      usdValue: cached.price * amount,
      sources: [{ price: cached.price, source: cached.source }],
      status: 'ready',
    };
  }

  const sourceList = [
    { fn: fetchPriceProxy, name: 'coingecko' },
    { fn: fetchRaydiumPrice, name: 'raydium' },
    { fn: fetchJupiterPrice, name: 'jupiter' },
    { fn: fetchCMCPrice, name: 'cmc' },
  ];

  for (const { fn, name } of sourceList) {
    try {
      const price = await withTimeout(
        fn({ mint: token.mint, symbol: token.symbol }),
        2000
      );
      if (price && price > 0) {
        // 💾 Cache
        priceCache.set(key, { price, source: name, timestamp: now });
        return {
          usdValue: price * amount,
          sources: [{ price, source: name }],
          status: 'ready',
        };
      }
    } catch (err) {
      console.warn(`⚠️ ${name} failed or timed out`);
    }
  }

  // ❌ All failed
  return {
    usdValue: 0,
    sources: [],
    status: 'not_found',
  };
}
