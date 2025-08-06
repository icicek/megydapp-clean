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
  status: 'found' | 'not_found' | 'loading' | 'error';
}

const priceCache = new Map<
  string,
  { price: number; source: string; timestamp: number }
>();

const CACHE_TTL = 1000 * 60 * 5; // 5 dakika
const TIMEOUT_MS = 2000; // Maksimum bekleme süresi her kaynak için

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.warn('🕒 Request timed out after', ms, 'ms');
      reject(new Error('Timeout'));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timeout);
        console.log('✅ Price source responded');
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.warn('❌ Price fetch failed:', err.message);
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

  console.log('⏳ Starting price fetch for', token.symbol || token.mint);

  // ✅ Use cache if available
  const cached = priceCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log('⚡ Returning cached price for', token.symbol || token.mint);
    return {
      usdValue: cached.price * amount,
      sources: [{ price: cached.price, source: cached.source }],
      status: 'found',
    };
  }

  const sources = [
    { fn: fetchPriceProxy, name: 'coingecko' },
    { fn: fetchRaydiumPrice, name: 'raydium' },
    { fn: fetchJupiterPrice, name: 'jupiter' },
    { fn: fetchCMCPrice, name: 'cmc' },
  ];

  for (const { fn, name } of sources) {
    try {
      console.log(`🌐 Trying ${name}...`);
      const price = await withTimeout(
        fn({ mint: token.mint, symbol: token.symbol }),
        TIMEOUT_MS
      );
      if (price && price > 0) {
        console.log(`✅ ${name} returned price: $${price}`);
        priceCache.set(key, { price, source: name, timestamp: now });
        return {
          usdValue: price * amount,
          sources: [{ price, source: name }],
          status: 'found',
        };
      } else {
        console.warn(`⚠️ ${name} returned zero or invalid price`);
      }
    } catch (err) {
      console.warn(`🚫 ${name} failed:`, err.message);
    }
  }

  console.warn('❌ No price source returned a valid result');
  return {
    usdValue: 0,
    sources: [],
    status: 'not_found',
  };
}
