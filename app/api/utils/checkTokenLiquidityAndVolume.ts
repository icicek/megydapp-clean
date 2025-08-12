// checkTokenLiquidityAndVolume.ts
import getVolumeAndLiquidity from './getVolumeAndLiquidity';
import { TokenCategory } from './classifyToken';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface LiquidityResult {
  volume: number | null;
  liquidity: number | null;
  category: TokenCategory;
}

export async function checkTokenLiquidityAndVolume(token: TokenInfo): Promise<LiquidityResult> {
  const { volume, liquidity } = await getVolumeAndLiquidity(token);

  let category: TokenCategory = 'deadcoin';

  if (volume !== null && liquidity !== null) {
    if (volume >= 10000 && liquidity >= 10000) {
      category = 'healthy';
    } else if (volume >= 100 && liquidity >= 100) {
      category = 'walking_dead';
    }
  }

  return { volume, liquidity, category };
}
