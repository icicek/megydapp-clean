// app/api/utils/checkTokenLiquidityAndVolume.ts
import getVolumeAndLiquidity from './getVolumeAndLiquidity';
import type { TokenCategory } from './classifyToken';
import { getTokenThresholds } from '@/app/api/_lib/token-thresholds';

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

export type LiquidityReason =
  | 'healthy'
  | 'low_activity'
  | 'illiquid'
  | 'subhealthy'
  | 'no_data';

export interface LiquidityResult {
  volume: number | null;      // 24h total (DEX + optional CEX)
  dexVolume: number | null;   // 24h DEX
  cexVolume: number | null;   // 24h CEX
  liquidity: number | null;   // max pool liquidity

  category: TokenCategory;    // healthy | walking_dead | deadcoin | ...

  reason: LiquidityReason;    // 👈 NEW (debug + meta)

  sources: {
    dex: 'dexscreener' | 'geckoterminal' | 'none';
    cex: 'coingecko' | 'none';
  };
}

function toNonNegNumber(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Liquidity-first classification (DB-backed thresholds):
 *
 * - If no DEX data at all → deadcoin (no_data)  [NOTE: price-deadcoin is handled elsewhere]
 * - If liquidity < WD_MIN_LIQ → walking_dead (illiquid)  (MEGY decision handled in payout layer)
 * - Else if liquidity >= HEALTHY_MIN_LIQ AND volume >= HEALTHY_MIN_VOL → healthy
 * - Else → walking_dead (low_activity)
 *
 * Volume is secondary; liquidity is primary.
 */
export async function checkTokenLiquidityAndVolume(token: TokenInfo): Promise<LiquidityResult> {
  const vl = (await getVolumeAndLiquidity(token)) as unknown as VL;

  const dexVol = toNonNegNumber(vl?.dexVolumeUSD ?? 0);
  const cexVol = toNonNegNumber(vl?.cexVolumeUSD ?? 0);
  const totalVol = toNonNegNumber(vl?.totalVolumeUSD ?? (dexVol + cexVol));
  const liq = toNonNegNumber(vl?.dexLiquidityUSD ?? 0);

  const dexSource = vl?.dexSource ?? 'none';
  const cexSource = vl?.cexSource ?? 'none';

  const { healthyMinLiq, healthyMinVol, walkingDeadMinLiq, walkingDeadMinVol } =
    await getTokenThresholds();

  // If absolutely no DEX signal, treat as deadcoin by metrics layer.
  // (Price-based deadcoin is determined in getUsdValue/classifyToken.)
  const noDexSignal = (dexSource === 'none') && liq === 0 && dexVol === 0;

  let category: TokenCategory = 'deadcoin';
  let reason: LiquidityReason = 'no_data';

  if (noDexSignal) {
    category = 'deadcoin';
    reason = 'no_data';
  } else if (liq < walkingDeadMinLiq) {
    // illiquid but still has some signal (or could be just small liq)
    category = 'walking_dead';
    reason = 'illiquid';
  } else if (liq >= healthyMinLiq && totalVol >= healthyMinVol) {
    category = 'healthy';
    reason = 'healthy';
  } else {
    category = 'walking_dead';
    // Volume secondary: liq yeterli olsa bile volume düşükse “low_activity”,
    // volume WD_MIN_VOL üstündeyse “subhealthy” (liq ok, volume ok-ish, ama healthy barı geçmedi)
    reason = totalVol <= walkingDeadMinVol ? 'low_activity' : 'subhealthy';
  }

  return {
    volume: totalVol,
    dexVolume: dexVol,
    cexVolume: cexVol,
    liquidity: liq,
    category,
    reason,
    sources: { dex: dexSource, cex: cexSource },
  };
}
