// app/api/claim/preview/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { getDistributionPoolNumber } from '@/app/api/_lib/feature-flags';

// Ağırlık katsayıları (seninkiyle aynı)
const USD_CONTRIBUTION_WEIGHT = 100;
const REFERRAL_PERSON_WEIGHT = 100;
const REFERRAL_USD_WEIGHT = 50;
const DEADCOIN_WEIGHT = 100;
const REFERRAL_DEADCOIN_WEIGHT = 100;
const SHARE_ON_X_WEIGHT = 30;

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet')?.trim();
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Missing wallet' }, { status: 400 });
    }

    const [
      referralCountRes,
      referralUsdRes,
      referralDeadRes,
      totalStatsRes,
      deadcoinRes,
      shareCheckRes,
      totalCorePointRes,
    ] = await Promise.all([
      sql`SELECT COUNT(*) FROM contributions WHERE referrer_wallet = ${wallet};`,
      sql`SELECT COALESCE(SUM(usd_value), 0) AS referral_usd_contributions FROM contributions WHERE referrer_wallet = ${wallet};`,
      sql`SELECT COUNT(DISTINCT token_contract) AS referral_deadcoins FROM contributions WHERE referrer_wallet = ${wallet} AND usd_value = 0;`,
      sql`SELECT COALESCE(SUM(usd_value), 0) AS total_usd_contributed, COUNT(*) AS total_coins_contributed FROM contributions WHERE wallet_address = ${wallet};`,
      sql`SELECT DISTINCT token_contract FROM contributions WHERE wallet_address = ${wallet} AND usd_value = 0;`,
      sql`SELECT COUNT(*) FROM shares WHERE wallet_address = ${wallet};`,
      sql`
        SELECT SUM(
          COALESCE(
            (SELECT SUM(usd_value) FROM contributions WHERE wallet_address = p.wallet_address) * ${USD_CONTRIBUTION_WEIGHT}
            + (SELECT COUNT(*) FROM contributions WHERE referrer_wallet = p.wallet_address) * ${REFERRAL_PERSON_WEIGHT}
            + (SELECT SUM(usd_value) FROM contributions WHERE referrer_wallet = p.wallet_address) * ${REFERRAL_USD_WEIGHT}
            + (SELECT COUNT(DISTINCT token_contract) FROM contributions WHERE wallet_address = p.wallet_address AND usd_value = 0) * ${DEADCOIN_WEIGHT}
            + (SELECT COUNT(DISTINCT token_contract) FROM contributions WHERE referrer_wallet = p.wallet_address AND usd_value = 0) * ${REFERRAL_DEADCOIN_WEIGHT}
            + (SELECT CASE WHEN EXISTS (SELECT 1 FROM shares WHERE wallet_address = p.wallet_address) THEN ${SHARE_ON_X_WEIGHT} ELSE 0 END)
          , 0)
        ) AS total_core_point
        FROM participants p;
      `,
    ]);

    const referral_count = parseInt((referralCountRes[0] as any).count || '0', 10);
    const referral_usd_contributions = parseFloat((referralUsdRes[0] as any).referral_usd_contributions || 0);
    const referral_deadcoin_count = parseInt((referralDeadRes[0] as any).referral_deadcoins || '0', 10);
    const total_usd_contributed = parseFloat((totalStatsRes[0] as any).total_usd_contributed || 0);
    const uniqueDeadcoinCount = (deadcoinRes as any[]).length;
    const hasShared = parseInt((shareCheckRes[0] as any).count || '0', 10) > 0;
    const sharePoint = hasShared ? SHARE_ON_X_WEIGHT : 0;

    const core_point =
      total_usd_contributed * USD_CONTRIBUTION_WEIGHT +
      referral_count * REFERRAL_PERSON_WEIGHT +
      referral_usd_contributions * REFERRAL_USD_WEIGHT +
      uniqueDeadcoinCount * DEADCOIN_WEIGHT +
      referral_deadcoin_count * REFERRAL_DEADCOIN_WEIGHT +
      sharePoint;

    const total_core_point = parseFloat((totalCorePointRes[0] as any).total_core_point || 0);
    const pool = await getDistributionPoolNumber();
    const share = total_core_point > 0 ? core_point / total_core_point : 0;
    const amount = pool * share;

    return NextResponse.json({ success: true, pool, share, amount });
  } catch (error: any) {
    console.error('[claim/preview] error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Internal error' }, { status: 500 });
  }
}
