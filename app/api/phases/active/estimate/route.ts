//app/api/phases/active/estimate/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';

function num(v: any, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = (searchParams.get('wallet') || '').trim();

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'MISSING_WALLET' },
        { status: 400 }
      );
    }

    // 1) Current active phase (authoritative lifecycle source)
    const ph = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        name,
        COALESCE(pool_megy, megy_pool, 0)::numeric AS pool_megy,
        COALESCE(rate_usd_per_megy, rate, 0)::numeric AS rate_usd_per_megy,
        COALESCE(
          target_usd,
          usd_cap,
          (COALESCE(pool_megy,0)::numeric * COALESCE(rate_usd_per_megy,0)::numeric),
          (COALESCE(megy_pool,0)::numeric * COALESCE(rate,0)::numeric),
          0
        )::numeric AS target_usd
      FROM phases
      WHERE status = 'active'
        AND snapshot_taken_at IS NULL
      ORDER BY phase_no ASC, id ASC
      LIMIT 1
    `) as any[];

    if (!ph?.[0]) {
      return NextResponse.json({
        success: true,
        active: null,
        totals: {
          totalUsd: 0,
          totalMegy: 0,
          rows: 0,
          wallets: 0,
          fillPct: 0,
        },
        me: {
          userUsd: 0,
          userMegy: 0,
          userRows: 0,
          shareRatio: 0,
          estimatedMegy: 0,
        },
      });
    }

    const phaseId = Number(ph[0].id);
    const poolMegy = num(ph[0].pool_megy, 0);
    const rateUsdPerMegy = num(ph[0].rate_usd_per_megy, 0);
    const targetUsd = num(ph[0].target_usd, 0);

    // 2) Active phase totals from phase_allocations (economic truth)
    const tot = (await sql/* sql */`
      SELECT
        COALESCE(SUM(COALESCE(pa.usd_allocated, 0)::numeric), 0)::numeric AS total_usd,
        COALESCE(SUM(COALESCE(pa.megy_allocated, 0)::numeric), 0)::numeric AS total_megy,
        COUNT(*)::int AS rows,
        COUNT(DISTINCT pa.wallet_address)::int AS wallets
      FROM phase_allocations pa
      WHERE pa.phase_id = ${phaseId}
    `) as any[];

    const totalUsd = num(tot?.[0]?.total_usd, 0);
    const totalMegy = num(tot?.[0]?.total_megy, 0);
    const rows = Number(tot?.[0]?.rows ?? 0);
    const wallets = Number(tot?.[0]?.wallets ?? 0);

    // 3) User totals from phase_allocations
    const me = (await sql/* sql */`
      SELECT
        COALESCE(SUM(COALESCE(pa.usd_allocated, 0)::numeric), 0)::numeric AS user_usd,
        COALESCE(SUM(COALESCE(pa.megy_allocated, 0)::numeric), 0)::numeric AS user_megy,
        COUNT(*)::int AS user_rows
      FROM phase_allocations pa
      WHERE pa.phase_id = ${phaseId}
        AND pa.wallet_address = ${wallet}
    `) as any[];

    const userUsd = num(me?.[0]?.user_usd, 0);
    const userMegy = num(me?.[0]?.user_megy, 0);
    const userRows = Number(me?.[0]?.user_rows ?? 0);

    // 4) Derived metrics
    const shareRatio = totalMegy > 0 ? userMegy / totalMegy : 0;
    const estimatedMegy = userMegy;

    const fillPct = targetUsd > 0 ? Math.max(0, Math.min(1, totalUsd / targetUsd)) : 0;

    return NextResponse.json({
      success: true,
      active: {
        id: phaseId,
        phaseNo: Number(ph[0].phase_no),
        name: String(ph[0].name || ''),
        poolMegy,
        rateUsdPerMegy,
        targetUsd,
      },
      totals: {
        totalUsd,
        totalMegy,
        rows,
        wallets,
        fillPct,
      },
      me: {
        userUsd,
        userMegy,
        userRows,
        shareRatio,
        estimatedMegy,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'UNKNOWN' },
      { status: 500 }
    );
  }
}