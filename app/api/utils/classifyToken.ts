import getUsdValue from './getUsdValue';
import getVolumeAndLiquidity from './getVolumeAndLiquidity';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

export type TokenCategory = 'healthy' | 'walking_dead' | 'deadcoin' | 'unknown';

interface ClassificationResult {
  category: TokenCategory;
  usdValue: number;
  priceSources: { price: number; source: string }[];
  volume: number | null;
  liquidity: number | null;
  status: 'ok' | 'not_found' | 'fetching' | 'error'; // 🔄 Yeni
}

export default async function classifyToken(
  token: TokenInfo,
  amount: number
): Promise<ClassificationResult> {
  const priceResult = await getUsdValue(token, amount);

  // Eğer fiyat hâlâ aranıyorsa → unknown
  if (priceResult.status === 'fetching') {
    return {
      category: 'unknown',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
      status: 'fetching',
    };
  }

  // Fiyat hiç bulunamadıysa → deadcoin
  if (
    priceResult.status === 'not_found' ||
    priceResult.status === 'error' ||
    priceResult.usdValue === 0
  ) {
    return {
      category: 'deadcoin',
      usdValue: 0,
      priceSources: priceResult.sources || [],
      volume: null,
      liquidity: null,
      status: priceResult.status,
    };
  }

  // Hacim ve likidite ile detaylı analiz
  const { volume, liquidity } = await getVolumeAndLiquidity(token);

  if (
    volume !== null &&
    liquidity !== null &&
    volume >= 10000 &&
    liquidity >= 10000
  ) {
    return {
      category: 'healthy',
      usdValue: priceResult.usdValue,
      priceSources: priceResult.sources,
      volume,
      liquidity,
      status: 'ok',
    };
  }

  if (
    volume !== null &&
    liquidity !== null &&
    volume >= 100 &&
    liquidity >= 100
  ) {
    return {
      category: 'walking_dead',
      usdValue: priceResult.usdValue,
      priceSources: priceResult.sources,
      volume,
      liquidity,
      status: 'ok',
    };
  }

  // Hacim/l likidite yok ama fiyat var → yine de deadcoin
  return {
    category: 'deadcoin',
    usdValue: priceResult.usdValue,
    priceSources: priceResult.sources,
    volume,
    liquidity,
    status: 'ok',
  };
}
