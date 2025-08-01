import axios from 'axios';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

// CoinMarketCap’teki SOLANA ağına ait tokenlar için slug ve adres eşleşmesi gerekiyor.
// En doğrusu: senin kendi eşleştirme listen olması (contract <-> id/slug)

const SOLANA_PLATFORM_ID = 1027; // ETH: 1027, SOLANA: 5426, vs.

const CMC_API_KEY = process.env.CMC_API_KEY;

export async function fetchCMCPrice(token: TokenInfo): Promise<number | null> {
  if (!CMC_API_KEY) {
    console.error('❌ CoinMarketCap API key is missing in environment variables.');
    return null;
  }

  try {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/token/map?address=${token.mint}`;

    const mapResponse = await axios.get(url, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
      },
    });

    const mapped = mapResponse.data?.data?.[0];
    const tokenId = mapped?.id;

    if (!tokenId) {
      console.warn(`🔍 CMC token ID not found for mint: ${token.mint}`);
      return null;
    }

    const priceResponse = await axios.get(
      `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=${tokenId}`,
      {
        headers: {
          'X-CMC_PRO_API_KEY': CMC_API_KEY,
        },
      }
    );

    const price = priceResponse.data?.data?.[tokenId]?.quote?.USD?.price;
    return price && price > 0 ? price : null;
  } catch (err) {
    console.error('❌ Error fetching price from CoinMarketCap:', err);
    return null;
  }
}
