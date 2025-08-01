import { PublicKey } from '@solana/web3.js';

export async function fetchRaydiumPrice(token: { mint: string }): Promise<number | null> {
  try {
    const response = await fetch('https://api.raydium.io/pairs');
    if (!response.ok) {
      console.warn('❌ Raydium API failed');
      return null;
    }

    const data = await response.json();

    // Raydium API returns a list of pools with baseMint and quoteMint
    for (const pair of data.official ?? []) {
      if (pair.baseMint === token.mint || pair.quoteMint === token.mint) {
        const price = parseFloat(pair.price || '0');
        if (price > 0) {
          console.log(`✅ Raydium price found: $${price}`);
          return price;
        }
      }
    }

    console.warn(`⚠️ Raydium: No matching pair found for ${token.mint}`);
    return null;
  } catch (error) {
    console.error('❌ Raydium price fetch error:', error);
    return null;
  }
}
