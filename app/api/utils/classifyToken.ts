// classifyToken.ts
import getUsdValue from './getUsdValue';
import { checkTokenLiquidityAndVolume } from './checkTokenLiquidityAndVolume';

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
}

// 🔹 Burada listeler veri tabanından veya JSON'dan gelebilir.
// Şimdilik basit dizi örnekleri ekliyorum:
const DeadcoinList = new Set<string>([]);
const Redlist = new Set<string>([]);
const Blacklist = new Set<string>([]);

export default async function classifyToken(token: TokenInfo, amount: number): Promise<ClassificationResult> {
  // 1️⃣ Önce listelerden kontrol et
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

  // 2️⃣ Fiyat sorgusu
  const priceResult = await getUsdValue(token, amount);

  if (priceResult.status === 'loading') {
    return {
      category: 'unknown',
      usdValue: 0,
      priceSources: [],
      volume: null,
      liquidity: null,
      status: 'loading',
    };
  }

  if (priceResult.status === 'not_found' || priceResult.usdValue <= 0) {
    // Değeri 0 → Deadcoin
    return {
      category: 'deadcoin',
      usdValue: 0,
      priceSources: priceResult.sources || [],
      volume: null,
      liquidity: null,
      status: 'not_found',
    };
  }

  // 3️⃣ Hacim & likidite kontrolü
  const { volume, liquidity, category } = await checkTokenLiquidityAndVolume(token);

  return {
    category,
    usdValue: priceResult.usdValue,
    priceSources: priceResult.sources,
    volume,
    liquidity,
    status: 'ok',
  };
}
