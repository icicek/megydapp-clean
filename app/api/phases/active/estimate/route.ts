// app/api/phases/active/estimate/route.ts
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
      return NextResponse.json({ success: false, error: 'MISSING_WALLET' }, { status: 400 });
    }

    // 1) Active phase
    const ph = (await sql/* sql */`
      SELECT
        id,
        phase_no,
        name,
        COALESCE(pool_megy, megy_pool, 0)::numeric AS pool_megy,
        COALESCE(rate_usd_per_megy, rate, 0)::numeric AS rate_usd_per_megy
      FROM phases
      WHERE LOWER(status) = 'active'
      ORDER BY opened_at DESC NULLS LAST, id DESC
      LIMIT 1
    `) as any[];

    if (!ph?.length) {
      return NextResponse.json({ success: true, active: null });
    }

    const phaseId = Number(ph[0].id);
    const poolMegy = num(ph[0].pool_megy, 0);

    // 2) totals in active phase (assigned contributions only)
    const tot = (await sql/* sql */`
      SELECT
        COALESCE(SUM(COALESCE(usd_value, 0)), 0)::numeric AS total_usd,
        COUNT(*)::int AS rows,
        COUNT(DISTINCT wallet_address)::int AS wallets
      FROM contributions
      WHERE phase_id = ${phaseId}
        AND COALESCE(alloc_status, 'pending') IN ('pending', 'assigned')
    `) as any[];

    const totalUsd = num(tot?.[0]?.total_usd, 0);

    // 3) user's usd in active phase
    const me = (await sql/* sql */`
      SELECT
        COALESCE(SUM(COALESCE(usd_value, 0)), 0)::numeric AS user_usd,
        COUNT(*)::int AS user_rows
      FROM contributions
      WHERE phase_id = ${phaseId}
        AND wallet_address = ${wallet}
        AND COALESCE(alloc_status, 'pending') IN ('pending', 'assigned')
    `) as any[];

    const userUsd = num(me?.[0]?.user_usd, 0);

    // 4) estimate
    const shareRatio = totalUsd > 0 ? userUsd / totalUsd : 0;
    const estimatedMegy = poolMegy > 0 ? poolMegy * shareRatio : 0;

    return NextResponse.json({
      success: true,
      active: {
        id: phaseId,
        phaseNo: Number(ph[0].phase_no),
        name: String(ph[0].name || ''),
        poolMegy,
        rateUsdPerMegy: num(ph[0].rate_usd_per_megy, 0),
      },
      totals: {
        totalUsd,
        rows: Number(tot?.[0]?.rows ?? 0),
        wallets: Number(tot?.[0]?.wallets ?? 0),
      },
      me: {
        userUsd,
        userRows: Number(me?.[0]?.user_rows ?? 0),
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
