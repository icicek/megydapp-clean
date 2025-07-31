import NodeCache from 'node-cache';
import { fetchPriceViaProxy } from './fetchPriceProxy';
import fetchPriceFromRaydium from './fetchPriceFromRaydium';
import fetchPriceFromJupiter from './fetchPriceFromJupiter';
import fetchPriceFromCMC from './fetchPriceFromCMC';

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
): Promise<{
  usdValue: number;
  sources: PriceResult[];
  usedPrice: number;
  status: 'ready' | 'not_found' | 'fetching' | 'error';
}> {
  const cacheKey = `price_${token.mint}`;
  const cached = cache.get<PriceResult>(cacheKey);

  if (cached) {
    console.log(`⚡ Cache hit for ${token.mint}: $${cached.price} (${cached.source})`);
    return {
      usdValue: cached.price * amount,
      sources: [cached],
      usedPrice: cached.price,
      status: 'ready',
    };
  }

  const sources = [
    { name: 'Proxy-Coingecko', fetcher: () => fetchPriceViaProxy(token) },
    { name: 'Raydium', fetcher: () => fetchPriceFromRaydium(token) },
    { name: 'Jupiter', fetcher: () => fetchPriceFromJupiter(token) },
    { name: 'CoinMarketCap', fetcher: () => fetchPriceFromCMC(token) },
  ];

  try {
    const results = await Promise.allSettled(
      sources.map(({ fetcher }) => fetcher())
    );

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const source = sources[i].name;

      if (res.status === 'fulfilled' && res.value && res.value > 0) {
        const price = res.value;
        const result: PriceResult = { price, source };

        cache.set(cacheKey, result);
        console.log(`✅ Fast price from ${source}: $${price}`);

        return {
          usdValue: price * amount,
          sources: [result],
          usedPrice: price,
          status: 'ready',
        };
      }
    }

    console.warn(`❌ No valid price for ${token.mint}`);
    return {
      usdValue: 0,
      sources: [],
      usedPrice: 0,
      status: 'not_found',
    };
  } catch (error) {
    console.error(`🚨 Unexpected error fetching price for ${token.mint}`, error);
    return {
      usdValue: 0,
      sources: [],
      usedPrice: 0,
      status: 'error',
    };
  }
}
