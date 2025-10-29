// app/api/utils/classifyToken.ts
import getUsdValue from './getUsdValue';
import { checkTokenLiquidityAndVolume } from './checkTokenLiquidityAndVolume';
import type { LiquidityResult } from './checkTokenLiquidityAndVolume';

export type TokenCategory = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist' | 'unknown';

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

  // 🔽 Yeni (opsiyonel, geriye dönük uyumlu):
  volumeBreakdown?: {
    dexVolumeUSD: number | null;
    cexVolumeUSD: number | null;
    totalVolumeUSD: number | null;
  };
  volumeSources?: LiquidityResult['sources']; // { dex, cex }
}

// 🔹 Bu listeler ileride DB/JSON’dan beslenecek (şimdilik placeholder)
const DeadcoinList = new Set<string>([]);
const Redlist = new Set<string>([]);
const Blacklist = new Set<string>([]);

export default async function classifyToken(token: TokenInfo, amount: number): Promise<ClassificationResult> {
  // 1) Öncelik: yönetimsel listeler
  if (Blacklist.has(token.mint)) {
    return {
      category: 'blacklist',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
      status: 'ok',
    };
  }
  if (Redlist.has(token.mint)) {
    return {
      category: 'redlist',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
      status: 'ok',
    };
  }
  if (DeadcoinList.has(token.mint)) {
    return {
      category: 'deadcoin',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
      status: 'ok',
    };
  }

  // 2) Fiyat sorgusu (kısa devre kuralları)
  const priceResult = await getUsdValue(token as any, amount);

  // getUsdValue artık 'loading' dönmüyor → error/not_found/ok
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
    // Fiyat yok veya 0 → Deadcoin
    return {
      category: 'deadcoin',
      usdValue: 0,
      priceSources: priceResult.sources || [],
      volume: null,
      liquidity: null,
      status: 'not_found',
    };
  }

  // 3) Hacim & likidite kontrolü (kararı burada vereceğiz)
  const liq: LiquidityResult = await checkTokenLiquidityAndVolume(token);

  return {
    category: liq.category,
    usdValue: priceResult.usdValue,
    priceSources: priceResult.sources,
    volume: liq.volume,
    liquidity: liq.liquidity,
    status: 'ok',

    // ↴ yeni kırılımlar ve kaynak bilgisi (UI/analiz için faydalı)
    volumeBreakdown: {
      dexVolumeUSD: liq.dexVolume,
      cexVolumeUSD: liq.cexVolume,
      totalVolumeUSD: liq.volume,
    },
    volumeSources: liq.sources,
  };
}
