import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Ağırlık katsayıları
const USD_CONTRIBUTION_WEIGHT = 100;
const REFERRAL_PERSON_WEIGHT = 100;
const REFERRAL_USD_WEIGHT = 50;
const DEADCOIN_WEIGHT = 100;
const REFERRAL_DEADCOIN_WEIGHT = 100;

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.pathname.match(/\/claim\/([^/]+)/)?.[1];

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet path' },
        { status: 400 }
      );
    }

    // Katılımcı bilgisi
    const participantResult = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;
    if (participantResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No participant data found' },
        { status: 404 }
      );
    }
    const participant = participantResult[0];

    // Referans sayısı
    const referralResult = await sql`
      SELECT COUNT(*) FROM contributions WHERE referrer_wallet = ${wallet};
    `;
    const referral_count = parseInt((referralResult[0] as any).count || '0', 10);

    // Referans katkı USD toplamı
    const referralUsdResult = await sql`
      SELECT COALESCE(SUM(usd_value), 0) AS referral_usd_contributions
      FROM contributions
      WHERE referrer_wallet = ${wallet};
    `;
    const referral_usd_contributions = parseFloat(referralUsdResult[0].referral_usd_contributions || 0);

    // Referans deadcoin sayısı
    const referralDeadcoinResult = await sql`
      SELECT COUNT(DISTINCT token_contract) AS referral_deadcoins
      FROM contributions
      WHERE referrer_wallet = ${wallet} AND usd_value = 0;
    `;
    const referral_deadcoin_count = parseInt(referralDeadcoinResult[0].referral_deadcoins || '0', 10);

    // USD katkı ve toplam token sayısı
    const totalStatsResult = await sql`
      SELECT 
        COALESCE(SUM(usd_value), 0) AS total_usd_contributed,
        COUNT(*) AS total_coins_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const { total_usd_contributed, total_coins_contributed } = totalStatsResult[0] as any;

    // Eşsiz deadcoin kontrat adresleri (kişinin kendi yaptığı)
    const deadcoinResult = await sql`
      SELECT DISTINCT token_contract
      FROM contributions
      WHERE wallet_address = ${wallet} AND usd_value = 0;
    `;
    const uniqueDeadcoinCount = deadcoinResult.length;

    // İşlem geçmişi
    const transactionsResult = await sql`
      SELECT token_symbol, token_amount, usd_value, timestamp
      FROM contributions
      WHERE wallet_address = ${wallet}
      ORDER BY timestamp DESC;
    `;

    // Kendi CorePoint puanı
    const core_point =
      parseFloat(total_usd_contributed) * USD_CONTRIBUTION_WEIGHT +
      referral_count * REFERRAL_PERSON_WEIGHT +
      referral_usd_contributions * REFERRAL_USD_WEIGHT +
      uniqueDeadcoinCount * DEADCOIN_WEIGHT +
      referral_deadcoin_count * REFERRAL_DEADCOIN_WEIGHT;

    // Tüm sistemdeki toplam CorePoint
    const totalCorePointResult = await sql`
      SELECT SUM(
        COALESCE(
          (SELECT SUM(usd_value) FROM contributions WHERE wallet_address = p.wallet_address) * ${USD_CONTRIBUTION_WEIGHT}
          + (SELECT COUNT(*) FROM contributions WHERE referrer_wallet = p.wallet_address) * ${REFERRAL_PERSON_WEIGHT}
          + (SELECT SUM(usd_value) FROM contributions WHERE referrer_wallet = p.wallet_address) * ${REFERRAL_USD_WEIGHT}
          + (SELECT COUNT(DISTINCT token_contract) FROM contributions WHERE wallet_address = p.wallet_address AND usd_value = 0) * ${DEADCOIN_WEIGHT}
          + (SELECT COUNT(DISTINCT token_contract) FROM contributions WHERE referrer_wallet = p.wallet_address AND usd_value = 0) * ${REFERRAL_DEADCOIN_WEIGHT}
        , 0)
      ) AS total_core_point
      FROM participants p;
    `;
    const total_core_point = parseFloat(totalCorePointResult[0].total_core_point || 0);
    const pvc_share = total_core_point > 0 ? core_point / total_core_point : 0;

    return NextResponse.json({
      success: true,
      data: {
        id: participant.id,
        wallet_address: participant.wallet_address,
        referral_code: participant.referral_code || null,
        claimed: participant.claimed || false,
        referral_count,
        referral_usd_contributions,
        referral_deadcoin_count,
        total_usd_contributed: parseFloat(total_usd_contributed),
        total_coins_contributed: parseInt(total_coins_contributed, 10),
        transactions: transactionsResult,
        core_point,
        total_core_point,
        pvc_share,
        core_point_breakdown: {
          coincarnations: parseFloat(total_usd_contributed) * USD_CONTRIBUTION_WEIGHT,
          referrals:
            referral_count * REFERRAL_PERSON_WEIGHT +
            referral_usd_contributions * REFERRAL_USD_WEIGHT +
            referral_deadcoin_count * REFERRAL_DEADCOIN_WEIGHT,
          deadcoins: uniqueDeadcoinCount * DEADCOIN_WEIGHT,
          shares: 0,
        },
      },
    });
  } catch (err) {
    console.error('Error fetching claim data:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}
