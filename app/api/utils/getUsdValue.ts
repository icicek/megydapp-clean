import pythMapping from './pythMapping.json';
import NodeCache from 'node-cache';
import { PublicKey } from '@solana/web3.js';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface PriceResult {
  price: number;
  source: string;
}

const cache = new NodeCache({ stdTTL: 1800 }); // 30 dakika cache

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

  // CoinGecko
  try {
    const isSol = token.symbol?.toUpperCase() === 'SOL' || token.mint === 'So11111111111111111111111111111111111111112';
    const coingeckoUrl = isSol
      ? `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`
      : `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token.mint}&vs_currencies=usd`;

    console.log(`🌐 Fetching CoinGecko price from ${coingeckoUrl}`);
    const res = await fetch(coingeckoUrl);
    const json = await res.json();
    const price = isSol
      ? json?.solana?.usd
      : Object.values(json).length > 0 ? (Object.values(json)[0] as any)?.usd : undefined;

    if (price) {
      console.log(`✅ CoinGecko price for ${token.symbol || token.mint}: $${price}`);
      prices.push({ price, source: 'CoinGecko' });
    } else {
      console.warn(`❌ CoinGecko returned no price for ${token.symbol || token.mint}`);
    }
  } catch (e) {
    console.warn('⚠️ CoinGecko API failed:', e);
  }

  // Jupiter (only if symbol exists)
  if (token.symbol) {
    try {
      console.log(`🌐 Fetching Jupiter price for ${token.symbol}`);
      const res = await fetch(`https://price.jup.ag/v4/price?ids=${token.symbol}`);
      const json = await res.json();
      const price = json.data?.[token.symbol]?.price;
      if (price) {
        console.log(`✅ Jupiter price for ${token.symbol}: $${price}`);
        prices.push({ price, source: 'Jupiter' });
      } else {
        console.warn(`❌ Jupiter returned no price for ${token.symbol}`);
      }
    } catch (e) {
      console.warn('⚠️ Jupiter API failed:', e);
    }
  }

  // Pyth
  try {
    const pythPrice = await getPythPrice(token.mint);
    if (pythPrice) {
      console.log(`✅ Pyth Network price for ${token.symbol || token.mint}: $${pythPrice}`);
      prices.push({ price: pythPrice, source: 'Pyth Network' });
    } else {
      console.warn(`❌ No Pyth price for ${token.symbol || token.mint}`);
    }
  } catch (e) {
    console.warn('⚠️ Pyth Network failed:', e);
  }

  // Orca
  try {
    const dexPrice = await getDexPoolPrice(token.mint);
    if (dexPrice) {
      console.log(`✅ Orca DEX price for ${token.symbol || token.mint}: $${dexPrice}`);
      prices.push({ price: dexPrice, source: 'Orca DEX' });
    } else {
      console.warn(`❌ No Orca DEX price for ${token.symbol || token.mint}`);
    }
  } catch (e) {
    console.warn('⚠️ Orca DEX fetch failed:', e);
  }

  // Raydium
  try {
    const raydiumPrice = await getRaydiumPrice(token.mint);
    if (raydiumPrice) {
      console.log(`✅ Raydium price for ${token.symbol || token.mint}: $${raydiumPrice}`);
      prices.push({ price: raydiumPrice, source: 'Raydium' });
    } else {
      console.warn(`❌ No Raydium price for ${token.symbol || token.mint}`);
    }
  } catch (e) {
    console.warn('⚠️ Raydium fetch failed:', e);
  }

  if (prices.length === 0) {
    console.warn(`⚠️ No price sources found for ${token.symbol || token.mint}`);
    return { usdValue: 0, sources: [], usedPrice: 0 };
  }

  cache.set(cacheKey, { prices });
  return calculateFinalPrice(prices, amount);
}

function calculateFinalPrice(prices: PriceResult[], amount: number) {
  const sorted = [...prices].sort((a, b) => a.price - b.price);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid].price
    : (sorted[mid - 1].price + sorted[mid].price) / 2;

  const accepted = prices.filter(p => Math.abs((p.price - median) / median) * 100 <= 5);
  const finalPrices = accepted.length > 0 ? accepted : prices;
  const avgPrice = finalPrices.reduce((sum, p) => sum + p.price, 0) / finalPrices.length;

  console.log('📊 Prices collected:', prices);
  console.log('📊 Median price calculated:', median);
  console.log('✅ Final average price selected:', avgPrice);

  return {
    usdValue: amount * avgPrice,
    sources: finalPrices,
    usedPrice: avgPrice,
  };
}

async function getPythPrice(mint: string): Promise<number | null> {
  const feedId = (pythMapping as Record<string, string>)[mint];
  if (!feedId) {
    console.info(`ℹ️ No Pyth price feed for mint: ${mint}`);
    return null;
  }

  try {
    const res = await fetch(`https://hermes.pyth.network/v2/price_feed_ids/${feedId}`);
    const data = await res.json();
    return data?.price?.price ?? null;
  } catch (e) {
    console.error('❌ Error fetching Pyth price:', e);
    return null;
  }
}

async function getDexPoolPrice(mint: string): Promise<number | null> {
  try {
    const res = await fetch('https://api.orca.so/allPools');
    const json = await res.json();

    for (const pool of json.pools) {
      if (pool.tokenA.mint === mint || pool.tokenB.mint === mint) {
        return pool.price;
      }
    }
    return null;
  } catch (e) {
    console.error('❌ Error fetching Orca DEX pool price:', e);
    return null;
  }
}

async function getRaydiumPrice(mint: string): Promise<number | null> {
  try {
    const res = await fetch('https://api.raydium.io/pairs');
    const json = await res.json();

    const pool = json?.data?.find((p: any) => p.baseMint === mint || p.quoteMint === mint);
    return pool ? parseFloat(pool.price) : null;
  } catch (e) {
    console.error('❌ Error fetching Raydium price:', e);
    return null;
  }
}
