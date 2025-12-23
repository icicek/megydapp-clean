// app/api/admin/tokens/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

import { getStatusRow, resolveEffectiveStatus } from '@/app/api/_lib/registry';
import type { TokenStatus } from '@/app/api/_lib/types';

import { getTokenThresholds } from '@/app/api/_lib/token-thresholds';
import { checkTokenLiquidityAndVolume } from '@/app/api/utils/checkTokenLiquidityAndVolume';

import getUsdValue, { type PriceResult } from '@/app/api/utils/getUsdValue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function n2(x: number) {
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

type MetricsCategory = 'healthy' | 'walking_dead' | 'deadcoin';
function asMetricsCat(x: string | null | undefined): MetricsCategory | null {
  if (x === 'healthy' || x === 'walking_dead' || x === 'deadcoin') return x;
  return null;
}

function pickRegistrySource(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  const source = typeof m.source === 'string' ? m.source : null;
  const via = typeof m.via === 'string' ? m.via : null;
  return source ?? via ?? null;
}

function pickLock(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  return Boolean(m.lock);
}

function computeEffectiveReason(input: {
  registryStatus: TokenStatus | null;
  metricsCategory: MetricsCategory | null;
  usdValue: number;
}) {
  const rs = input.registryStatus;
  const mc = input.metricsCategory;
  const usd = Number(input.usdValue) || 0;

  if (rs === 'blacklist') return 'registry_blacklist_lock';
  if (rs === 'redlist') return 'registry_redlist_lock';
  if (rs === 'deadcoin') return 'registry_deadcoin_lock';

  if (usd === 0) return 'price_zero_deadcoin';

  if (mc === 'deadcoin') return 'metrics_category_deadcoin';
  if (mc === 'walking_dead') return 'metrics_category_walking_dead';
  if (mc === 'healthy') return 'metrics_category_healthy';

  return 'fallback_registry_or_healthy';
}

// Type-safe price snapshot (no any)
async function readUsdValueForMint(mint: string): Promise<{ usdValue: number; price: PriceResult }> {
  try {
    const pr: PriceResult = await getUsdValue({ mint, amount: 1 });

    // We only need “is there a price?” signal.
    // If found → use usdValue (already amount-adjusted)
    // else → 0
    const v = pr.status === 'found' ? Number(pr.usdValue || 0) : 0;
    return { usdValue: Number.isFinite(v) && v > 0 ? v : 0, price: pr };
  } catch {
    // If getUsdValue throws, treat as unpriced
    const fallback: PriceResult = {
      status: 'error',
      usdValue: 0,
      unitPriceUSD: 0,
      sources: [],
      ok: false,
      error: 'getUsdValue threw',
    };
    return { usdValue: 0, price: fallback };
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req as unknown as NextRequest);

    const { searchParams } = new URL(req.url);
    const mint = (searchParams.get('mint') || '').trim();
    if (!mint) {
      return NextResponse.json({ success: false, error: 'mint is required' }, { status: 400 });
    }

    // 1) Threshold snapshot (DB-backed)
    const thresholds = await getTokenThresholds();

    // 2) Registry row (lock/override visibility)
    const row = await getStatusRow(mint);
    const meta: unknown = row?.meta ?? null;

    const registryStatus: TokenStatus | null = row ? row.status : null;
    const registrySource = pickRegistrySource(meta);
    const lock = pickLock(meta);

    // 3) Metrics decision (liq/vol + sources + reason)
    const liq = await checkTokenLiquidityAndVolume({ mint });

    // 4) Numbers (clean)
    const vol = n2(liq.volume ?? 0);
    const dexVol = n2(liq.dexVolume ?? 0);
    const cexVol = n2(liq.cexVolume ?? 0);
    const liquidity = n2(liq.liquidity ?? 0);

    const metricsCategory = asMetricsCat(liq.category);

    // 5) Price snapshot (for effective decision)
    const priced = await readUsdValueForMint(mint);
    const usdValue = n2(priced.usdValue);

    // 6) Effective status (registry + metrics + price)
    const effectiveStatus: TokenStatus = resolveEffectiveStatus({
      registryStatus,
      registrySource,
      metricsCategory,
      usdValue,
    });

    const effectiveReason = computeEffectiveReason({
      registryStatus,
      metricsCategory,
      usdValue,
    });

    // 7) Build “why” reasons (human-readable)
    const reasons: string[] = [];
    reasons.push(`effective.status=${effectiveStatus}`);
    reasons.push(`effective.reason=${effectiveReason}`);
    reasons.push(`registry.status=${registryStatus ?? 'null'}`);
    reasons.push(`registry.source=${registrySource ?? 'null'}`);
    reasons.push(`registry.lock=${String(lock)}`);
    reasons.push(`price.status=${priced.price.status}`);
    reasons.push(`price.usdValue=${usdValue}`);
    reasons.push(`metrics.category=${liq.category}`);
    reasons.push(`metrics.reason=${liq.reason}`);
    reasons.push(`sources.dex=${liq.sources.dex}`);
    reasons.push(`sources.cex=${liq.sources.cex}`);
    reasons.push(
      `liq=${liquidity} vs WD_MIN_LIQ=${thresholds.walkingDeadMinLiq} / HEALTHY_MIN_LIQ=${thresholds.healthyMinLiq}`
    );
    reasons.push(
      `vol(total)=${vol} (dex=${dexVol}, cex=${cexVol}) vs HEALTHY_MIN_VOL=${thresholds.healthyMinVol} / WD_MIN_VOL=${thresholds.walkingDeadMinVol}`
    );

    return NextResponse.json({
      success: true,
      mint,

      thresholds,

      registry: row
        ? {
            status: row.status,
            status_at: row.status_at,
            updated_by: row.updated_by,
            reason: row.reason,
            meta: row.meta ?? null,
            lock,
          }
        : null,

      metrics: {
        category: liq.category,
        reason: liq.reason,
        liquidityUSD: liquidity,
        volumeUSD: vol,
        dexVolumeUSD: dexVol,
        cexVolumeUSD: cexVol,
        sources: liq.sources,
      },

      effective: {
        status: effectiveStatus,
        reason: effectiveReason,
        usdValue,
        // optionally expose price.status/sources too (debug)
        // price: priced.price,
      },

      why: { reasons },
    });
  } catch (e: unknown) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
