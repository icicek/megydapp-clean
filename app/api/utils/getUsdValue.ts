interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface PriceResult {
  price: number;      // USD değeri
  source: string;     // Kaynak ismi (CoinGecko, Jupiter, Pyth, DEX)
}

export default async function getUsdValue(token: TokenInfo, amount: number): Promise<{ usdValue: number, sources: PriceResult[] }> {
  const prices: PriceResult[] = [];

  // 1️⃣ CoinGecko
  try {
    const isSol = token.symbol?.toUpperCase() === 'SOL' || token.mint === 'SOL';
    if (isSol) {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`);
      const json = await res.json();
      const price = json?.solana?.usd;
      if (price) {
        prices.push({ price, source: 'CoinGecko' });
      }
    } else {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token.mint}&vs_currencies=usd`);
      const json = await res.json();
      const priceData = Object.values(json)[0] as { usd?: number };
      const price = priceData?.usd;
      if (price) {
        prices.push({ price, source: 'CoinGecko' });
      }
    }
  } catch (e) {
    console.warn('⚠️ CoinGecko API failed:', e);
  }

  // 2️⃣ Jupiter API
  if (token.symbol) {
    try {
      const jupRes = await fetch(`https://price.jup.ag/v4/price?ids=${token.symbol}`);
      const jupJson = await jupRes.json();
      const jupPrice = jupJson.data?.[token.symbol]?.price;
      if (jupPrice) {
        prices.push({ price: jupPrice, source: 'Jupiter' });
      }
    } catch (e) {
      console.warn('⚠️ Jupiter API fetch failed:', e);
    }
  }

  // 3️⃣ Pyth Network (Simülasyon / Pyth entegrasyonu eklenebilir)
  // TODO: On-chain query ile gerçek Pyth fiyatı alınabilir.
  // Bu kısımda simülasyon koyuyorum. Gerçek kullanımda Pyth client entegre edilmeli.
  /*
  try {
    const pythPrice = await getPythPrice(token.mint); // Örn: özel fonksiyon
    if (pythPrice) {
      prices.push({ price: pythPrice, source: 'Pyth Network' });
    }
  } catch (e) {
    console.warn('⚠️ Pyth price fetch failed:', e);
  }
  */

  // 4️⃣ DEX Pool Fiyatı (Simülasyon / Öneri: Raydium/Orca entegrasyonu)
  /*
  try {
    const dexPrice = await getDexPoolPrice(token.mint);
    if (dexPrice) {
      prices.push({ price: dexPrice, source: 'DEX Pool' });
    }
  } catch (e) {
    console.warn('⚠️ DEX price fetch failed:', e);
  }
  */

  if (prices.length === 0) {
    console.warn(`⚠️ No price found for token ${token.symbol || token.mint}. Returning 0.`);
    return { usdValue: 0, sources: [] };
  }

  // ✅ Median hesapla
  const priceValues = prices.map(p => p.price).sort((a, b) => a - b);
  const mid = Math.floor(priceValues.length / 2);
  const median = priceValues.length % 2 !== 0
    ? priceValues[mid]
    : (priceValues[mid - 1] + priceValues[mid]) / 2;

  console.log('📊 All prices:', prices);
  console.log('📊 Calculated median price:', median);

  // ✅ %5 altında sapma kontrolü
  const acceptedPrices = prices.filter(p => {
    const diffPercent = Math.abs((p.price - median) / median) * 100;
    return diffPercent <= 5;
  });

  if (acceptedPrices.length === 0) {
    console.warn('⚠️ All prices deviated >5%. Using median as fallback.');
    return { usdValue: amount * median, sources: prices };
  }

  // ✅ Ortalama fiyatı al
  const avgPrice = acceptedPrices.reduce((sum, p) => sum + p.price, 0) / acceptedPrices.length;
  console.log('✅ Final average price:', avgPrice, 'from sources:', acceptedPrices.map(p => p.source));

  return {
    usdValue: amount * avgPrice,
    sources: acceptedPrices
  };
}
