interface TokenInfo {
  mint: string;
  symbol?: string;
}

export default async function getUsdValue(token: TokenInfo, amount: number): Promise<number> {
  try {
    // 1️⃣ Jupiter (sadece symbol varsa!)
    if (token.symbol) {
      const jupRes = await fetch(`https://price.jup.ag/v4/price?ids=${token.symbol}`);
      const jupJson = await jupRes.json();
      const jupPrice = jupJson.data?.[token.symbol]?.price;
      if (jupPrice) {
        return amount * jupPrice;
      }
    }
  } catch (e) {
    console.warn('⚠️ Jupiter API fetch failed:', e);
  }

  try {
    // 2️⃣ CoinGecko fallback
    if (token.symbol?.toUpperCase() === 'SOL') {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`);
      const json = await res.json();
      const price = json?.solana?.usd;
      return price ? amount * price : 0;
    } else {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token.mint}&vs_currencies=usd`);
      const json = await res.json();
      const priceData = Object.values(json)[0] as { usd?: number };
      const price = priceData?.usd;
      return price ? amount * price : 0;
    }
  } catch (e) {
    console.warn('⚠️ CoinGecko fallback failed:', e);
  }

  // 💀 Fiyat bulunamazsa gerçekten 0 dönüyor
  return 0;
}
