export default async function getVolumeAndLiquidity(token: { mint: string }): Promise<{
    volume: number | null;
    liquidity: number | null;
  }> {
    try {
      const res = await fetch('https://api.raydium.io/pairs');
      const data = await res.json();
  
      const found = data.find((pair: any) =>
        pair.baseMint === token.mint || pair.quoteMint === token.mint
      );
  
      if (!found) {
        console.warn(`⚠️ Raydium pair not found for ${token.mint}`);
        return { volume: null, liquidity: null };
      }
  
      const volume = Number(found.volume24hQuote || 0);
      const liquidity = Number(found.liquidity || 0);
  
      return {
        volume,
        liquidity,
      };
    } catch (err) {
      console.error('❌ Failed to fetch volume/liquidity from Raydium:', err);
      return { volume: null, liquidity: null };
    }
  }
  