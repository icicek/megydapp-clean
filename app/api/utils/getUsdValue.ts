interface TokenInfo {
  mint: string;
  symbol?: string;
}

export default async function getUsdValue(token: TokenInfo, amount: number): Promise<number> {
  // 1️⃣ Önce CoinGecko üzerinden kontrat adresinden fiyat almayı dene
  try {
    const isSol = token.symbol?.toUpperCase() === 'SOL' || token.mint === 'SOL';
    if (isSol) {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`);
      const json = await res.json();
      const price = json?.solana?.usd;
      if (price) {
        console.log('✅ CoinGecko SOL price:', price);
        return amount * price;
      }
    } else {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token.mint}&vs_currencies=usd`);
      const json = await res.json();
      const priceData = Object.values(json)[0] as { usd?: number };
      const price = priceData?.usd;
      if (price) {
        console.log('✅ CoinGecko token price for', token.mint, ':', price);
        return amount * price;
      }
    }
  } catch (e) {
    console.warn('⚠️ CoinGecko API fetch failed:', e);
  }

  // 2️⃣ Eğer CoinGecko sonuç vermezse ve symbol varsa Jupiter API'dan fiyat al
  if (token.symbol) {
    try {
      const jupRes = await fetch(`https://price.jup.ag/v4/price?ids=${token.symbol}`);
      const jupJson = await jupRes.json();
      const jupPrice = jupJson.data?.[token.symbol]?.price;
      if (jupPrice) {
        console.log('✅ Jupiter price for symbol', token.symbol, ':', jupPrice);
        return amount * jupPrice;
      }
    } catch (e) {
      console.warn('⚠️ Jupiter API fetch failed:', e);
    }
  }

  // 3️⃣ Hala bulunamazsa
  console.warn(`⚠️ USD value not found for token: ${token.symbol || token.mint}. Returning 0.`);
  return 0;
}
