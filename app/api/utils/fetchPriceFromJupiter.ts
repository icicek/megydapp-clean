export async function fetchJupiterPrice(token: { mint: string }): Promise<number | null> {
    try {
      const response = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${token.mint}&outputMint=So11111111111111111111111111111111111111112&amount=100000000`, {
        headers: { 'accept': 'application/json' }
      });
  
      if (!response.ok) {
        console.warn('❌ Jupiter API request failed');
        return null;
      }
  
      const data = await response.json();
      if (data && data.data && data.data.length > 0) {
        const outAmount = parseFloat(data.data[0].outAmount);
        const inAmount = parseFloat(data.data[0].inAmount);
        if (outAmount && inAmount) {
          const solPrice = 22; // Referans USD fiyat (güncel SOL fiyatı sabitlenmiş)
          const solOut = outAmount / 1e9; // SOL miktarına çevir
          const price = solOut * solPrice / (inAmount / 1e8); // 1 token USD fiyatı
          console.log(`✅ Jupiter price found: $${price}`);
          return price;
        }
      }
  
      console.warn(`⚠️ Jupiter: No price data found for ${token.mint}`);
      return null;
    } catch (error) {
      console.error('❌ Jupiter price fetch error:', error);
      return null;
    }
  }
  