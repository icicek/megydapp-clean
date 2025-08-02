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

// 🧠 CACHE
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

  // ✅ Check cache
  const cached = priceCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return {
      usdValue: cached.price * amount,
      sources: [{ price: cached.price, source: cached.source }],
      status: 'ready',
    };
  }

  // 📡 Try all sources
  const sources = [
    { fn: fetchPriceProxy, name: 'coingecko' },
    { fn: fetchRaydiumPrice, name: 'raydium' },
    { fn: fetchJupiterPrice, name: 'jupiter' },
    { fn: fetchCMCPrice, name: 'cmc' },
  ];

  try {
    const result = await Promise.any(
      sources.map(({ fn, name }) =>
        withTimeout(fn({ mint: token.mint, symbol: token.symbol }), 5000).then(
          (price) => {
            if (price && price > 0) {
              // 💾 Cache the result
              priceCache.set(key, {
                price,
                source: name,
                timestamp: now,
              });
              return { price, source: name };
            }
            throw new Error(`${name} returned no price`);
          }
        )
      )
    );

    return {
      usdValue: result.price * amount,
      sources: [result],
      status: 'ready',
    };
  } catch (error) {
    console.warn('❌ All price sources failed or timed out');
    return {
      usdValue: 0,
      sources: [],
      status: 'not_found',
    };
  }
}
