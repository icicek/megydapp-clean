import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

type ParticipantRow = {
  id: number;
  wallet_address: string;
  token_symbol: string;
  token_contract: string;
  network: string;
  token_amount: number;
  usd_value: number;
  transaction_signiture: string;
  timestamp: string;
  claimable_amount: number;
  claimed: boolean;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    // Ana katılımcı bilgileri
    const participantResult = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;

    const rows = participantResult as unknown as ParticipantRow[];
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No data found' },
        { status: 404 }
      );
    }

    // Referral sayısı
    const referralResult = await sql`
      SELECT COUNT(*) FROM contributions WHERE referrer_wallet = ${wallet};
    `;
    const referral_count = parseInt((referralResult[0] as any).count || '0', 10);

    // Toplam USD katkısı
    const usdResult = await sql`
      SELECT COALESCE(SUM(usd_value), 0) AS total_usd_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const total_usd_contributed = parseFloat((usdResult[0] as any).total_usd_contributed || '0');

    // Toplam token miktarı
    const tokenResult = await sql`
      SELECT COALESCE(SUM(token_amount), 0) AS total_token_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const total_token_contributed = parseFloat((tokenResult[0] as any).total_token_contributed || '0');

    // Toplam farklı coin katkısı (çeşitlilik sayısı)
    const coinResult = await sql`
      SELECT COUNT(DISTINCT token_symbol) AS total_coins_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const total_coins_contributed = parseInt((coinResult[0] as any).total_coins_contributed || '0', 10);

    return NextResponse.json({
      success: true,
      data: {
        ...rows[0],
        referral_count,
        total_usd_contributed,
        total_token_contributed,
        total_coins_contributed,
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
