// app/api/admin/tokens/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

import { getStatusRow } from '@/app/api/_lib/registry';
import { getTokenThresholds } from '@/app/api/_lib/token-thresholds';
import { checkTokenLiquidityAndVolume } from '@/app/api/utils/checkTokenLiquidityAndVolume';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    const { searchParams } = new URL(req.url);
    const mint = (searchParams.get('mint') || '').trim();
    if (!mint) {
      return NextResponse.json({ success: false, error: 'mint is required' }, { status: 400 });
    }

    // 1) Threshold snapshot (DB-backed)
    const thresholds = await getTokenThresholds(); 
    // expected keys: healthyMinLiq, healthyMinVol, walkingDeadMinLiq, walkingDeadMinVol

    // 2) Registry row (lock/override visibility)
    const row = await getStatusRow(mint);
    const meta = row?.meta ?? null;

    // 3) Metrics decision (liq/vol + sources + reason)
    const liq = await checkTokenLiquidityAndVolume({ mint });

    // 4) Build “why” reasons (human-readable)
    const vol = liq.volume ?? 0;
    const dexVol = liq.dexVolume ?? 0;
    const cexVol = liq.cexVolume ?? 0;
    const liquidity = liq.liquidity ?? 0;

    const reasons: string[] = [];
    reasons.push(`metrics.category=${liq.category}`);
    reasons.push(`metrics.reason=${liq.reason}`);
    reasons.push(`sources.dex=${liq.sources.dex}`);
    reasons.push(`sources.cex=${liq.sources.cex}`);
    reasons.push(`liq=${liquidity} vs WD_MIN_LIQ=${thresholds.walkingDeadMinLiq} / HEALTHY_MIN_LIQ=${thresholds.healthyMinLiq}`);
    reasons.push(`vol(total)=${vol} (dex=${dexVol}, cex=${cexVol}) vs HEALTHY_MIN_VOL=${thresholds.healthyMinVol} / WD_MIN_VOL=${thresholds.walkingDeadMinVol}`);

    // 5) Minimal lock signal (if you store meta.lock)
    const lock = meta && typeof meta === 'object' ? (meta as any).lock ?? null : null;

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

      why: {
        reasons,
      },
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
