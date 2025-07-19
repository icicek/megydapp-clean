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

const cache = new NodeCache({ stdTTL: 1800 }); // 30 dakika cache süresi

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

  // 1️⃣ CoinGecko
  try {
    const isSol = token.symbol?.toUpperCase() === 'SOL' || token.mint === 'So11111111111111111111111111111111111111112';
    const coingeckoUrl = isSol
      ? `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`
      : `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token.mint}&vs_currencies=usd`;
    
    const res = await fetch(coingeckoUrl);
    const json = await res.json();
    const price = isSol
      ? json?.solana?.usd
      : Object.values(json).length > 0 ? (Object.values(json)[0] as any)?.usd : undefined;

    if (price) {
      prices.push({ price, source: 'CoinGecko' });
    }
  } catch (e) {
    console.warn('⚠️ CoinGecko API failed:', e);
  }

  // 2️⃣ Jupiter
  if (token.symbol) {
    try {
      const res = await fetch(`https://price.jup.ag/v4/price?ids=${token.symbol}`);
      const json = await res.json();
      const price = json.data?.[token.symbol]?.price;
      if (price) prices.push({ price, source: 'Jupiter' });
    } catch (e) {
      console.warn('⚠️ Jupiter API failed:', e);
    }
  }

  // 3️⃣ Pyth Network
  try {
    const pythPrice = await getPythPrice(token.mint);
    if (pythPrice) prices.push({ price: pythPrice, source: 'Pyth Network' });
  } catch (e) {
    console.warn('⚠️ Pyth Network failed:', e);
  }

  // 4️⃣ Orca DEX
  try {
    const dexPrice = await getDexPoolPrice(token.mint);
    if (dexPrice) prices.push({ price: dexPrice, source: 'Orca DEX' });
  } catch (e) {
    console.warn('⚠️ DEX Pool API failed:', e);
  }

  // 5️⃣ Raydium
  try {
    const raydiumPrice = await getRaydiumPrice(token.mint);
    if (raydiumPrice) prices.push({ price: raydiumPrice, source: 'Raydium' });
  } catch (err) {
    console.warn('⚠️ Raydium fetch failed:', err);
  }

  if (prices.length === 0) {
    console.warn(`⚠️ No prices found for ${token.symbol || token.mint}`);
    return { usdValue: 0, sources: [], usedPrice: 0 };
  }

  cache.set(cacheKey, { prices });
  return calculateFinalPrice(prices, amount);
}

//
// -------- Price Calculation Helper --------
//
function calculateFinalPrice(prices: PriceResult[], amount: number) {
  const sorted = [...prices].sort((a, b) => a.price - b.price);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? sorted[mid].price
      : (sorted[mid - 1].price + sorted[mid].price) / 2;

  console.log('📊 Prices:', prices);
  console.log('📊 Median price:', median);

  const accepted = prices.filter((p) => {
    const diff = Math.abs((p.price - median) / median) * 100;
    return diff <= 5;
  });

  const finalPrices = accepted.length > 0 ? accepted : prices;
  const avgPrice = finalPrices.reduce((sum, p) => sum + p.price, 0) / finalPrices.length;

  console.log('✅ Final average price:', avgPrice);
  return {
    usdValue: amount * avgPrice,
    sources: finalPrices,
    usedPrice: avgPrice,
  };
}

//
// -------- Pyth Price Fetching --------
//
async function getPythPrice(mint: string): Promise<number | null> {
  const feedId = (pythMapping as Record<string, string>)[mint];
  if (!feedId) {
    console.info(`ℹ️ No Pyth price feed for mint: ${mint}`);
    return null;
  }

  try {
    const res = await fetch(`https://hermes.pyth.network/v2/price_feed_ids/${feedId}`);
    const data = await res.json();
    const price = data?.price?.price;
    return price ?? null;
  } catch (e) {
    console.error('❌ Error fetching Pyth price:', e);
    return null;
  }
}

//
// -------- Orca DEX Pool Price Fetching --------
//
async function getDexPoolPrice(mint: string): Promise<number | null> {
  try {
    const res = await fetch('https://api.orca.so/allPools');
    const json = await res.json();

    for (const pool of json.pools) {
      const tokenA = pool.tokenA.mint;
      const tokenB = pool.tokenB.mint;
      if (tokenA === mint || tokenB === mint) {
        return pool.price;
      }
    }
    return null;
  } catch (e) {
    console.error('❌ Error fetching DEX pool price:', e);
    return null;
  }
}

//
// -------- Raydium Price Fetching --------
//
async function getRaydiumPrice(mint: string): Promise<number | null> {
  try {
    const res = await fetch('https://api.raydium.io/pairs');
    const json = await res.json();
    const pool = json?.data?.find((p: any) =>
      p.baseMint === mint || p.quoteMint === mint
    );
    return pool ? parseFloat(pool.price) : null;
  } catch (e) {
    console.error('❌ Error fetching Raydium price:', e);
    return null;
  }
}
