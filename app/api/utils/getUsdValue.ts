import NodeCache from 'node-cache';
import { fetchPriceViaProxy } from './fetchPriceProxy';
import fetchPriceFromRaydium from './fetchPriceFromRaydium';
import fetchPriceFromJupiter from './fetchPriceFromJupiter';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface PriceResult {
  price: number;
  source: string;
}

const cache = new NodeCache({ stdTTL: 1800 }); // 30 dakika

export default async function getUsdValue(
  token: TokenInfo,
  amount: number
): Promise<{ usdValue: number; sources: PriceResult[]; usedPrice: number }> {
  const cacheKey = `price_${token.mint}`;
  const cached = cache.get<PriceResult>(cacheKey);
  if (cached) {
    console.log(`⚡ Cache hit for ${token.mint}: $${cached.price} (${cached.source})`);
    return {
      usdValue: cached.price * amount,
      sources: [cached],
      usedPrice: cached.price,
    };
  }

  const sources: { name: string; fetcher: () => Promise<number | null> }[] = [
    {
      name: 'Proxy-Coingecko',
      fetcher: () => fetchPriceViaProxy(token),
    },
    {
      name: 'Raydium',
      fetcher: () => fetchPriceFromRaydium(token),
    },
    {
      name: 'Jupiter',
      fetcher: () => fetchPriceFromJupiter(token),
    },
  ];

  for (const source of sources) {
    try {
      const price = await source.fetcher();
      if (price && price > 0) {
        const result: PriceResult = { price, source: source.name };
        cache.set(cacheKey, result);
        console.log(`✅ Price found from ${source.name}: $${price}`);
        return {
          usdValue: price * amount,
          sources: [result],
          usedPrice: price,
        };
      }
    } catch (err) {
      console.warn(`❌ Failed fetching price from ${source.name}:`, err);
    }
  }

  console.warn(`⚠️ All price sources failed for ${token.mint}`);
  return {
    usdValue: 0,
    sources: [],
    usedPrice: 0,
  };
}
