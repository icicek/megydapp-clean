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

function n2(x: number): number {
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

type MetricsCat = 'healthy' | 'walking_dead' | 'deadcoin' | null;

function asMetricsCat(x: string | null | undefined): MetricsCat {
  if (x === 'healthy' || x === 'walking_dead' || x === 'deadcoin') return x;
  return null;
}

function pickRegistrySource(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  const src = m.source;
  const via = m.via;
  if (typeof src === 'string' && src.trim()) return src;
  if (typeof via === 'string' && via.trim()) return via;
  return null;
}

function pickLock(meta: unknown): unknown | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  return (m.lock as unknown) ?? null;
}

function priceError(msg: string): PriceResult {
  // PriceResult requires: status, usdValue, unitPriceUSD, sources (+ optional ok/error)
  return {
    status: 'error',
    usdValue: 0,
    unitPriceUSD: 0,
    sources: [],
    ok: false,
    error: msg,
  };
}

function computeEffectiveReason(input: {
  registryStatus: TokenStatus | null;
  metricsCategory: MetricsCat;
  price: PriceResult;
}): string {
  const rs = input.registryStatus;
  const mc = input.metricsCategory;
  const p = input.price;

  if (rs === 'blacklist') return 'registry_blacklist_lock';
  if (rs === 'redlist') return 'registry_redlist_lock';
  if (rs === 'deadcoin') return 'registry_deadcoin_lock';

  // price signal
  if (p.status === 'found' && (Number(p.usdValue) || 0) === 0) return 'price_zero_deadcoin';
  if (p.status === 'not_found') return 'price_not_found';
  if (p.status === 'error') return 'price_error';

  // metrics signal
  if (mc === 'deadcoin') return 'metrics_category_deadcoin';
  if (mc === 'walking_dead') return 'metrics_category_walking_dead';
  if (mc === 'healthy') return 'metrics_category_healthy';

  return 'fallback_registry_or_healthy';
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

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

    const lock = pickLock(meta);
    const registryStatus: TokenStatus | null = (row?.status ?? null) as TokenStatus | null;
    const registrySource = pickRegistrySource(meta);

    // 3) Metrics decision (liq/vol + sources + reason)
    const liq = await checkTokenLiquidityAndVolume({ mint });

    // 4) Numbers (clean)
    const vol = n2(liq.volume ?? 0);
    const dexVol = n2(liq.dexVolume ?? 0);
    const cexVol = n2(liq.cexVolume ?? 0);
    const liquidity = n2(liq.liquidity ?? 0);

    const metricsCategory = asMetricsCat(liq.category);

    // 5) Price snapshot (typed, no casts)
    let price: PriceResult;
    try {
      price = await getUsdValue({ mint, amount: 1 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'price_failed';
      price = priceError(msg);
    }

    // For resolver: "pricedUsdValue" is usdValue for amount=1 (already amount-adjusted)
    const pricedUsdValue = price.status === 'found' ? n2(Number(price.usdValue) || 0) : 0;

    // 6) Effective status (registry + metrics + price)
    // IMPORTANT: resolveEffectiveStatus signature currently expects:
    // { registryStatus, registrySource, metricsCategory, usdValue }
    const effectiveStatus = resolveEffectiveStatus({
      registryStatus,
      registrySource,
      metricsCategory,
      usdValue: pricedUsdValue,
    });

    const effectiveReason = computeEffectiveReason({
      registryStatus,
      metricsCategory,
      price,
    });

    // 7) Build “why” reasons (human-readable)
    const reasons: string[] = [];
    reasons.push(`effective.status=${effectiveStatus}`);
    reasons.push(`effective.reason=${effectiveReason}`);
    reasons.push(`registry.status=${registryStatus ?? 'null'}`);
    reasons.push(`registry.source=${registrySource ?? 'null'}`);
    reasons.push(`registry.lock=${Boolean(lock)}`);

    reasons.push(`price.status=${price.status}`);
    reasons.push(`price.usdValue=${pricedUsdValue}`);
    reasons.push(`price.unitPriceUSD=${n2(Number(price.unitPriceUSD) || 0)}`);
    if (Array.isArray(price.sources) && price.sources.length) {
      const top = price.sources
        .slice(0, 4)
        .map(s => `${s.source}:${n2(s.price)}`)
        .join(', ');
      reasons.push(`price.sources=${top}`);
    } else {
      reasons.push(`price.sources=none`);
    }
    if (price.error) reasons.push(`price.error=${price.error}`);

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

      price: {
        status: price.status,
        usdValue: pricedUsdValue,
        unitPriceUSD: n2(Number(price.unitPriceUSD) || 0),
        sources: price.sources,
        error: price.error ?? null,
      },

      effective: {
        status: effectiveStatus,
        reason: effectiveReason,
        usdValue: pricedUsdValue,
      },

      why: { reasons },
    });
  } catch (e: unknown) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
