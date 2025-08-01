import { fetchPriceProxy } from './fetchPriceProxy';
import { fetchRaydiumPrice } from './fetchPriceFromRaydium';
import { fetchJupiterPrice } from './fetchPriceFromJupiter';
import { fetchCMCPrice } from './fetchPriceFromCMC';

export interface PriceSource {
  price: number;
  source: string;
}

interface TokenInfo {
  mint: string;
  symbol?: string;
}

type PriceStatus = 'ready' | 'not_found' | 'error' | 'fetching';

export async function getUsdValue(
  token: TokenInfo,
  amount: number
): Promise<{
  usdValue: number;
  sources: PriceSource[];
  usedPrice: number;
  status: PriceStatus;
}> {
  const sources: {
    fn: (token: { mint: string; symbol?: string }) => Promise<number | null>;
    name: string;
  }[] = [
    { fn: fetchPriceProxy, name: 'coingecko' },
    { fn: fetchRaydiumPrice, name: 'raydium' },
    { fn: fetchJupiterPrice, name: 'jupiter' },
    { fn: fetchCMCPrice, name: 'cmc' },
  ];

  const results: PriceSource[] = [];

  for (const { fn, name } of sources) {
    try {
      const price = await fn({ mint: token.mint, symbol: token.symbol });
      if (price !== null && price > 0) {
        results.push({ price, source: name });

        const usdValue = price * amount;
        return {
          usdValue,
          sources: results,
          usedPrice: price,
          status: 'ready',
        };
      }
    } catch (err) {
      console.warn(`⚠️ Price fetch error from ${name}:`, err);
    }
  }

  if (results.length === 0) {
    return {
      usdValue: 0,
      sources: [],
      usedPrice: 0,
      status: 'not_found',
    };
  }

  return {
    usdValue: 0,
    sources: results,
    usedPrice: 0,
    status: 'error',
  };
}

export default getUsdValue;
