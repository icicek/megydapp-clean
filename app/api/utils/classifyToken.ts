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
}

export default async function classifyToken(
  token: TokenInfo,
  amount: number
): Promise<ClassificationResult> {
  // 1. Get price
  const priceResult = await getUsdValue(token, amount);

  // No price found
  if (priceResult.usdValue === 0) {
    return {
      category: 'deadcoin',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
    };
  }

  // 2. Get volume and liquidity
  const { volume, liquidity } = await getVolumeAndLiquidity(token);

  // 3. Classification logic
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
    };
  }

  // If no volume or liquidity, but has price → still alive
  return {
    category: 'deadcoin',
    usdValue: priceResult.usdValue,
    priceSources: priceResult.sources,
    volume,
    liquidity,
  };
}
