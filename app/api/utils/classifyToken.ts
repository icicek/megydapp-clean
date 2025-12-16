// app/api/utils/classifyToken.ts
import getUsdValue from './getUsdValue';
import { checkTokenLiquidityAndVolume } from './checkTokenLiquidityAndVolume';
import type { LiquidityResult } from './checkTokenLiquidityAndVolume';

import { getEffectiveStatus } from '@/app/api/_lib/registry';
import type { TokenStatus } from '@/app/api/_lib/types';

export type TokenCategory =
  | 'healthy'
  | 'walking_dead'
  | 'deadcoin'
  | 'redlist'
  | 'blacklist'
  | 'unknown';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface ClassificationResult {
  category: TokenCategory;
  usdValue: number;
  priceSources: { price: number; source: string }[];
  volume: number | null;
  liquidity: number | null;
  status: 'ok' | 'not_found' | 'loading' | 'error';

  volumeBreakdown?: {
    dexVolumeUSD: number | null;
    cexVolumeUSD: number | null;
    totalVolumeUSD: number | null;
  };
  volumeSources?: LiquidityResult['sources'];
}

// 🔹 Placeholder listeler (şimdilik)
const DeadcoinList = new Set<string>([]);
const Redlist = new Set<string>([]);
const Blacklist = new Set<string>([]);

function mapRegistryToCategory(s: TokenStatus | null): TokenCategory | null {
  if (!s) return null;
  if (s === 'blacklist') return 'blacklist';
  if (s === 'redlist') return 'redlist';
  if (s === 'deadcoin') return 'deadcoin';
  if (s === 'walking_dead') return 'walking_dead';
  if (s === 'healthy') return 'healthy';
  return null;
}

export default async function classifyToken(
  token: TokenInfo,
  amount: number,
): Promise<ClassificationResult> {
  // 0) Registry override (DB)
  // Not: getEffectiveStatus red/black override + registry status kararını tek yerden verir.
  let regCategory: TokenCategory | null = null;
  try {
    const eff = (await getEffectiveStatus(token.mint)) as TokenStatus;
    regCategory = mapRegistryToCategory(eff);
  } catch {
    regCategory = null;
  }

  // 1) Öncelik: yönetimsel listeler (placeholder) + registry hard overrides
  // Registry + placeholder aynı sınıfta: black/red/deadcoin kesin blok/override.
  if (Blacklist.has(token.mint) || regCategory === 'blacklist') {
    return {
      category: 'blacklist',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
      status: 'ok',
    };
  }
  if (Redlist.has(token.mint) || regCategory === 'redlist') {
    return {
      category: 'redlist',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
      status: 'ok',
    };
  }
  if (DeadcoinList.has(token.mint) || regCategory === 'deadcoin') {
    return {
      category: 'deadcoin',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
      status: 'ok',
    };
  }

  // 2) Fiyat sorgusu
  const priceResult = await getUsdValue(token as any, amount);

  if (priceResult.status === 'error') {
    return {
      category: 'unknown',
      usdValue: 0,
      priceSources: priceResult.sources || [],
      volume: null,
      liquidity: null,
      status: 'error',
    };
  }

  if (priceResult.status === 'not_found' || priceResult.usdValue <= 0) {
    return {
      category: 'deadcoin',
      usdValue: 0,
      priceSources: priceResult.sources || [],
      volume: null,
      liquidity: null,
      status: 'not_found',
    };
  }

  // 3) Metrics (liq/vol) classification
  const liq: LiquidityResult = await checkTokenLiquidityAndVolume(token);

  // 4) walking_dead registry override: eğer registry WD ise,
  // metrics healthy olsa bile WD olarak dön.
  const finalCategory: TokenCategory =
    regCategory === 'walking_dead'
      ? 'walking_dead'
      : (liq.category as TokenCategory);

  return {
    category: finalCategory,
    usdValue: priceResult.usdValue,
    priceSources: priceResult.sources,
    volume: liq.volume,
    liquidity: liq.liquidity,
    status: 'ok',
    volumeBreakdown: {
      dexVolumeUSD: liq.dexVolume,
      cexVolumeUSD: liq.cexVolume,
      totalVolumeUSD: liq.volume,
    },
    volumeSources: liq.sources,
  };
}
