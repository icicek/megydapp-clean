// app/api/utils/checkTokenLiquidityAndVolume.ts
import getVolumeAndLiquidity from './getVolumeAndLiquidity';
import type { TokenCategory } from './classifyToken';

/**
 * SINIFLANDIRMA KURALI (24h):
 * - healthy       : totalVolumeUSD ≥ HEALTHY_MIN_VOL_USD  VE  dexLiquidityUSD ≥ HEALTHY_MIN_LIQ_USD
 * - walking_dead  : totalVolumeUSD ≥ WD_MIN_VOL_USD       VE  dexLiquidityUSD ≥ WD_MIN_LIQ_USD
 * - deadcoin      : diğer tüm durumlar (özellikle her ikisi de 100 altı ya da ≈0)
 *
 * Eşikler ENV ile ayarlanabilir; verilmezse varsayılanlar kullanılır.
 */

// ── ENV eşikleri (projeyle tutarlı isimler + backward-compat) ──────────────────
const HEALTHY_MIN_VOL = Number(
  process.env.HEALTHY_MIN_VOL_USD ??
    process.env.HEALTHY_MIN_USD ?? // eski ad
    10_000
);

const HEALTHY_MIN_LIQ = Number(
  process.env.HEALTHY_MIN_LIQ_USD ??
    10_000
);

const WD_MIN_VOL = Number(
  process.env.WALKING_DEAD_MIN_VOL_USD ??
    process.env.WALKING_DEAD_MIN_USD ?? // eski ad
    100
);

const WD_MIN_LIQ = Number(
  process.env.WALKING_DEAD_MIN_LIQ_USD ??
    100
);

// Giriş tipi
type TokenInfo = { mint: string; symbol?: string };

// getVolumeAndLiquidity dönüşünü yerel tip ile karşılıyoruz (tip uyumsuzluklarını engellemek için)
type VL = {
  dexVolumeUSD: number | null;
  dexLiquidityUSD: number | null;
  cexVolumeUSD: number | null;
  totalVolumeUSD: number | null;
  dexSource: 'dexscreener' | 'geckoterminal' | 'none';
  cexSource: 'coingecko' | 'none';
};

// Dışarıya döndüğümüz sonuç
export interface LiquidityResult {
  // toplulaştırılmış sinyaller
  volume: number | null;         // 24h toplam (DEX + opsiyonel CEX)
  dexVolume: number | null;      // 24h DEX
  cexVolume: number | null;      // 24h CEX
  liquidity: number | null;      // en yüksek DEX pool likiditesi (signal)

  // karar
  category: TokenCategory;

  // kaynak bilgisi
  sources: {
    dex: 'dexscreener' | 'geckoterminal' | 'none';
    cex: 'coingecko' | 'none';
  };
}

/**
 * Hacim & likiditeyi getirir, eşiklere göre kategoriyi belirler.
 */
export async function checkTokenLiquidityAndVolume(token: TokenInfo): Promise<LiquidityResult> {
  // Tip uyarılarını önlemek için bilinmeyenden yerel tipe cast ediyoruz
  const vl = (await getVolumeAndLiquidity(token)) as unknown as VL;

  const {
    dexVolumeUSD,
    cexVolumeUSD,
    totalVolumeUSD,
    dexLiquidityUSD,
    dexSource,
    cexSource,
  } = vl;

  // Güvenli sayısal dönüştürme + alt sınır 0
  const vol = Math.max(0, Number(totalVolumeUSD ?? 0));
  const liq = Math.max(0, Number(dexLiquidityUSD ?? 0));

  // ── Karar (İKİSİ BİRDEN şartı) ───────────────────────────────────────────────
  let category: TokenCategory = 'deadcoin';

  // healthy: İKİSİ DE yüksek eşiklerde
  if (vol >= HEALTHY_MIN_VOL && liq >= HEALTHY_MIN_LIQ) {
    category = 'healthy';
  }
  // walking_dead: İKİSİ DE orta bantta (alt eşiklerin üstünde)
  else if (vol >= WD_MIN_VOL && liq >= WD_MIN_LIQ) {
    category = 'walking_dead';
  }
  // deadcoin: diğer tüm durumlar (ikisi de düşük / biri düşük)
  else {
    category = 'deadcoin';
  }

  return {
    volume: vol,
    dexVolume: Math.max(0, Number(dexVolumeUSD ?? 0)),
    cexVolume: Math.max(0, Number(cexVolumeUSD ?? 0)),
    liquidity: liq,
    category,
    sources: { dex: dexSource, cex: cexSource },
  };
}
