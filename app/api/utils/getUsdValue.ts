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

// 🔹 Her isteğe timeout koy
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout'));
    }, ms);
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
  const tokenKey = `${token.symbol || token.mint}`;

  const sources = [
    { fn: fetchPriceProxy, name: 'coingecko' },
    { fn: fetchRaydiumPrice, name: 'raydium' },
    { fn: fetchJupiterPrice, name: 'jupiter' },
    { fn: fetchCMCPrice, name: 'cmc' },
  ];

  try {
    const results = await Promise.any(
      sources.map(({ fn, name }) =>
        withTimeout(fn({ mint: token.mint, symbol: token.symbol }), 5000)
          .then((price) => {
            if (price && price > 0) {
              return { price, source: name };
            }
            throw new Error(`${name} returned no price`);
          })
      )
    );

    const usdValue = results.price * amount;

    return {
      usdValue,
      sources: [results],
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
