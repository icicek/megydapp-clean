import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Ağırlık katsayıları
const USD_CONTRIBUTION_WEIGHT = 100;
const REFERRAL_WEIGHT = 50;
const DEADCOIN_WEIGHT = 100;

export async function GET(
  req: NextRequest,
  context: { params: { wallet: string } }
) {
  const wallet = context.params.wallet;

  try {
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

    // USD katkı ve toplam token sayısı
    const totalStatsResult = await sql`
      SELECT 
        COALESCE(SUM(usd_value), 0) AS total_usd_contributed,
        COUNT(*) AS total_coins_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const { total_usd_contributed, total_coins_contributed } = totalStatsResult[0] as any;

    // Eşsiz deadcoin kontrat adresleri
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

    // CorePoint dinamik hesaplama
    const core_point =
      parseFloat(total_usd_contributed) * USD_CONTRIBUTION_WEIGHT +
      referral_count * REFERRAL_WEIGHT +
      uniqueDeadcoinCount * DEADCOIN_WEIGHT;

      return NextResponse.json({
        success: true,
        data: {
          id: participant.id,
          wallet_address: participant.wallet_address,
          referral_code: participant.referral_code || null,
          claimed: participant.claimed || false,
          referral_count,
          total_usd_contributed: parseFloat(total_usd_contributed),
          total_coins_contributed: parseInt(total_coins_contributed, 10),
          transactions: transactionsResult,
          core_point,
          core_point_breakdown: {
            coincarnations: parseFloat(total_usd_contributed) * USD_CONTRIBUTION_WEIGHT,
            referrals: referral_count * REFERRAL_WEIGHT,
            deadcoins: uniqueDeadcoinCount * DEADCOIN_WEIGHT,
            shares: 0, // şu an eklenmemiş ama gelecekte eklersen bu alan hazır olur
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
