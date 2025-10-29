// app/api/utils/checkTokenLiquidityAndVolume.ts
import getVolumeAndLiquidity from './getVolumeAndLiquidity';
import type { TokenCategory } from './classifyToken';

// ── ENV eşikleri (projeyle tutarlı isimler + eski adlara geri uyum) ─────────────
// Registry'deki isimler: HEALTHY_MIN_VOL_USD, WALKING_DEAD_MIN_VOL_USD
// Eski dosyadaki isimler: HEALTHY_MIN_USD, WALKING_DEAD_MIN_USD
const HEALTHY_MIN_VOL = Number(
  process.env.HEALTHY_MIN_VOL_USD ??
    process.env.HEALTHY_MIN_USD ?? // backward-compat
    10_000
);

const WALKING_DEAD_MIN_VOL = Number(
  process.env.WALKING_DEAD_MIN_VOL_USD ??
    process.env.WALKING_DEAD_MIN_USD ?? // backward-compat
    100
);

type TokenInfo = { mint: string; symbol?: string };

// getVolumeAndLiquidity dönüşünü yerel tip ile karşılıyoruz
type VL = {
  dexVolumeUSD: number | null;
  dexLiquidityUSD: number | null;
  cexVolumeUSD: number | null;
  totalVolumeUSD: number | null;
  dexSource: 'dexscreener' | 'geckoterminal' | 'none';
  cexSource: 'coingecko' | 'none';
};

export interface LiquidityResult {
  // toplulaştırılmış sinyaller
  volume: number | null;         // 24h toplam (DEX + opsiyonel CEX)
  dexVolume: number | null;      // 24h DEX
  cexVolume: number | null;      // 24h CEX
  liquidity: number | null;      // en yüksek havuz likiditesi (signal)

  // karar
  category: TokenCategory;

  // kaynak bilgisi
  sources: { dex: string; cex: string };
}

export async function checkTokenLiquidityAndVolume(token: TokenInfo): Promise<LiquidityResult> {
  // Tip sorunlarını engellemek için yerel tipe cast
  const vl = (await getVolumeAndLiquidity(token)) as VL;

  const {
    dexVolumeUSD,
    cexVolumeUSD,
    totalVolumeUSD,
    dexLiquidityUSD,
    dexSource,
    cexSource,
  } = vl;

  // Sınıflandırma kuralı:
  // - totalVolumeUSD >= HEALTHY_MIN_VOL → healthy
  // - totalVolumeUSD >= WALKING_DEAD_MIN_VOL → walking_dead
  // - aksi halde → deadcoin
  const vol = totalVolumeUSD ?? 0;

  let category: TokenCategory = 'deadcoin';
  if (vol >= HEALTHY_MIN_VOL) category = 'healthy';
  else if (vol >= WALKING_DEAD_MIN_VOL) category = 'walking_dead';

  return {
    volume: totalVolumeUSD ?? 0,
    dexVolume: dexVolumeUSD ?? 0,
    cexVolume: cexVolumeUSD ?? 0,
    liquidity: dexLiquidityUSD ?? 0,
    category,
    sources: { dex: dexSource, cex: cexSource },
  };
}
