import pythMapping from './pythMapping.json';
import NodeCache from 'node-cache';
import { PublicKey } from '@solana/web3.js';
import { fetchPriceViaProxy } from './fetchPriceProxy';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface PriceResult {
  price: number;
  source: string;
}

const cache = new NodeCache({ stdTTL: 1800 });

export default async function getUsdValue(
  token: TokenInfo,
  amount: number
): Promise<{ usdValue: number; sources: PriceResult[]; usedPrice: number }> {
  const cacheKey = `price_${token.mint}`;
  const cached = cache.get<{ prices: PriceResult[] }>(cacheKey);
  if (cached) {
    console.log(`⚡ Cache hit for ${token.mint}`);
    return calculateFinalPrice(cached.prices, amount);
  }

  const prices: PriceResult[] = [];

  // Proxy via backend
  try {
    console.log(`🌐 Fetching price via proxy for ${token.symbol || token.mint}`);
    const proxyPrice = await fetchPriceViaProxy(token);
    if (proxyPrice) {
      console.log(`✅ Proxy returned price for ${token.symbol || token.mint}: $${proxyPrice}`);
      prices.push({ price: proxyPrice, source: 'Proxy-Coingecko' });
    } else {
      console.warn(`❌ Proxy returned no price for ${token.symbol || token.mint}`);
    }
  } catch (e) {
    console.warn('⚠️ Proxy fetch failed:', e);
  }

  if (prices.length === 0) {
    console.warn(`⚠️ No price sources found for ${token.symbol || token.mint}`);
    return { usdValue: 0, sources: [], usedPrice: 0 };
  }

  cache.set(cacheKey, { prices });
  return calculateFinalPrice(prices, amount);
}

function calculateFinalPrice(prices: PriceResult[], amount: number) {
  const avgPrice = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;

  return {
    usdValue: amount * avgPrice,
    sources: prices,
    usedPrice: avgPrice,
  };
}
