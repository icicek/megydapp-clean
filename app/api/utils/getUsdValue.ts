import pythMapping from './pythMapping.json';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface PriceResult {
  price: number;
  source: string;
}

export default async function getUsdValue(token: TokenInfo, amount: number): Promise<{ usdValue: number, sources: PriceResult[], usedPrice: number }> {
  const prices: PriceResult[] = [];

  // 1️⃣ CoinGecko
  try {
    const isSol = token.symbol?.toUpperCase() === 'SOL' || token.mint === 'So11111111111111111111111111111111111111112';
    if (isSol) {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`);
      const json = await res.json();
      const price = json?.solana?.usd;
      if (price) prices.push({ price, source: 'CoinGecko' });
    } else {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token.mint}&vs_currencies=usd`);
      const json = await res.json();
      const priceData = Object.values(json)[0] as { usd?: number };
      if (priceData?.usd) prices.push({ price: priceData.usd, source: 'CoinGecko' });
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
    console.warn('⚠️ Pyth price fetch failed:', e);
  }

  // 4️⃣ DEX Pool
  try {
    const dexPrice = await getDexPoolPrice(token.mint);
    if (dexPrice) prices.push({ price: dexPrice, source: 'DEX Pool' });
  } catch (e) {
    console.warn('⚠️ DEX pool price fetch failed:', e);
  }

  if (prices.length === 0) {
    console.warn(`⚠️ No price sources available for ${token.symbol || token.mint}.`);
    return { usdValue: 0, sources: [], usedPrice: 0 };
  }

  // ✅ Median hesapla
  const sortedPrices = [...prices].sort((a, b) => a.price - b.price);
  const mid = Math.floor(sortedPrices.length / 2);
  const median = sortedPrices.length % 2 !== 0
    ? sortedPrices[mid].price
    : (sortedPrices[mid - 1].price + sortedPrices[mid].price) / 2;

  console.log('📊 All prices:', prices);
  console.log('📊 Calculated median:', median);

  // ✅ %5 sapma kontrolü
  let acceptedPrices = prices.filter(p => {
    const diffPercent = Math.abs((p.price - median) / median) * 100;
    return diffPercent <= 5;
  });

  if (acceptedPrices.length >= 3) {
    acceptedPrices = acceptedPrices.filter(p => {
      const diffPercent = Math.abs((p.price - median) / median) * 100;
      return diffPercent <= 5;
    });
  }

  if (acceptedPrices.length === 0) {
    console.warn('⚠️ All prices deviated >5%. Using source priority fallback.');
    const priority = ['CoinGecko', 'Pyth Network', 'Jupiter', 'DEX Pool'];
    for (const source of priority) {
      const found = prices.find(p => p.source === source);
      if (found) {
        return { usdValue: amount * found.price, sources: [found], usedPrice: found.price };
      }
    }
    return { usdValue: 0, sources: [], usedPrice: 0 };
  }

  const avgPrice = acceptedPrices.reduce((sum, p) => sum + p.price, 0) / acceptedPrices.length;
  console.log('✅ Final average price:', avgPrice);

  return {
    usdValue: amount * avgPrice,
    sources: acceptedPrices,
    usedPrice: avgPrice
  };
}

//
// -------- Pyth Price Fetching --------
//
async function getPythPrice(mint: string): Promise<number | null> {
  const feedId = (pythMapping as Record<string, string>)[mint];
  if (!feedId) {
    console.info(`ℹ️ No Pyth price feed mapped for token mint: ${mint}. Skipping Pyth.`);
    return null;
  }

  try {
    const res = await fetch(`https://hermes.pyth.network/v2/price_feed_ids/${feedId}`);
    if (!res.ok) {
      console.error(`❌ Pyth API returned status ${res.status} for mint: ${mint}`);
      return null;
    }

    const data = await res.json();
    const price = data?.price?.price;

    if (price) {
      console.log(`✅ Pyth price for mint ${mint}: ${price}`);
      return price;
    } else {
      console.warn(`⚠️ No price found in Pyth data for mint: ${mint}`);
      return null;
    }
  } catch (e) {
    console.error('❌ Error fetching Pyth price:', e);
    return null;
  }
}

//
// -------- DEX Pool Price Fetching --------
//
async function getDexPoolPrice(mint: string): Promise<number | null> {
  try {
    const res = await fetch('https://api.orca.so/allPools');
    const json = await res.json();

    for (const pool of json.pools) {
      const tokenA = pool.tokenA.mint;
      const tokenB = pool.tokenB.mint;

      if (tokenA === mint || tokenB === mint) {
        const price = pool.price;
        console.log(`✅ DEX Pool price for mint ${mint}: ${price}`);
        return price;
      }
    }

    console.warn(`⚠️ No DEX pool found for mint: ${mint}`);
    return null;
  } catch (e) {
    console.error('❌ Error fetching DEX pool price:', e);
    return null;
  }
}
