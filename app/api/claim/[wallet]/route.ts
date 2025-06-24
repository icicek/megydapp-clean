import { neon } from '@neondatabase/serverless';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// ✅ Manuel olarak context tipini tanımlıyoruz
interface Params {
  params: {
    wallet: string;
  };
}

export async function GET(
  req: NextRequest,
  context: Params
) {
  const wallet = context.params.wallet;

  try {
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

    const referralResult = await sql`
      SELECT COUNT(*) FROM contributions WHERE referrer_wallet = ${wallet};
    `;
    const referral_count = parseInt((referralResult[0] as any).count || '0', 10);

    const totalStatsResult = await sql`
      SELECT 
        COALESCE(SUM(usd_value), 0) AS total_usd_contributed,
        COUNT(*) AS total_coins_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const { total_usd_contributed, total_coins_contributed } = totalStatsResult[0] as any;

    const transactionsResult = await sql`
      SELECT token_symbol, token_amount, usd_value, timestamp
      FROM contributions
      WHERE wallet_address = ${wallet}
      ORDER BY timestamp DESC;
    `;

    const core_point = participant.core_point !== undefined ? Number(participant.core_point) : 0;

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
