// app/api/claim/[wallet]/route.ts

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.pathname.match(/\/claim\/([^/]+)/)?.[1];

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet path' },
        { status: 400 }
      );
    }

    // 1) Katılımcı bilgisi
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

    // 2) Contributions tablosundan istatistikler (CP değil, sadece display)
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
    const referral_usd_contributions = parseFloat(
      (referralUsdResult[0] as any).referral_usd_contributions || 0
    );

    // Referans deadcoin sayısı (display için)
    const referralDeadcoinResult = await sql`
      SELECT COUNT(DISTINCT token_contract) AS referral_deadcoins
      FROM contributions
      WHERE referrer_wallet = ${wallet} AND usd_value = 0;
    `;
    const referral_deadcoin_count = parseInt(
      (referralDeadcoinResult[0] as any).referral_deadcoins || '0',
      10
    );

    // Kendi USD katkısı ve toplam token sayısı
    const totalStatsResult = await sql`
      SELECT 
        COALESCE(SUM(usd_value), 0) AS total_usd_contributed,
        COUNT(*) AS total_coins_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const {
      total_usd_contributed,
      total_coins_contributed,
    } = totalStatsResult[0] as any;

    // Eşsiz deadcoin kontrat adresleri (display için)
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

    // 3) CorePoint: TAMAMEN corepoint_events tablosundan
    const cpRows = await sql/* sql */`
      SELECT
        COALESCE(SUM(points) FILTER (WHERE type = 'usd'), 0)::float    AS cp_usd,
        COALESCE(SUM(points) FILTER (WHERE type = 'referral_signup'), 0)::float AS cp_ref,
        COALESCE(SUM(points) FILTER (WHERE type = 'deadcoin_first'), 0)::float  AS cp_dead,
        COALESCE(SUM(points) FILTER (WHERE type = 'share'), 0)::float  AS cp_share
      FROM corepoint_events
      WHERE wallet_address = ${wallet};
    `;
    const cpRow = cpRows[0] || {};
    const cpCoincarnations = Number(cpRow.cp_usd || 0);
    const cpReferrals = Number(cpRow.cp_ref || 0);
    const cpDeadcoins = Number(cpRow.cp_dead || 0);
    const cpShares = Number(cpRow.cp_share || 0);

    const core_point = cpCoincarnations + cpReferrals + cpDeadcoins + cpShares;

    // 4) Tüm sistemdeki toplam CorePoint (corepoint_events üzerinden)
    const totalCorePointResult = await sql/* sql */`
      SELECT COALESCE(SUM(points), 0)::float AS total_core_point
      FROM corepoint_events;
    `;
    const total_core_point = Number(
      (totalCorePointResult[0] as any).total_core_point || 0
    );
    const pvc_share =
      total_core_point > 0 ? core_point / total_core_point : 0;

    return NextResponse.json({
      success: true,
      data: {
        id: participant.id,
        wallet_address: participant.wallet_address,
        referral_code: participant.referral_code || null,
        claimed: participant.claimed || false,

        // Display istatistikleri (contributions’tan)
        referral_count,
        referral_usd_contributions,
        referral_deadcoin_count,
        total_usd_contributed: parseFloat(total_usd_contributed),
        total_coins_contributed: parseInt(total_coins_contributed, 10),
        transactions: transactionsResult,

        // CorePoint (artık tamamen corepoint_events tabanlı)
        core_point,
        total_core_point,
        pvc_share,
        core_point_breakdown: {
          coincarnations: cpCoincarnations,
          referrals: cpReferrals,
          deadcoins: cpDeadcoins,
          shares: cpShares,
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
