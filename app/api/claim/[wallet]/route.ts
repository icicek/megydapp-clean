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

    const participantResult = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;
    const rows = participantResult as unknown as ParticipantRow[];

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No participant data found' },
        { status: 404 }
      );
    }

    const referralResult = await sql`
      SELECT COUNT(*) FROM contributions WHERE referrer_wallet = ${wallet};
    `;
    const referral_count = parseInt((referralResult[0] as any).count || '0', 10);

    const contributionsResult = await sql`
      SELECT * FROM contributions WHERE wallet_address = ${wallet} ORDER BY timestamp DESC;
    `;

    return NextResponse.json({
      success: true,
      data: {
        ...rows[0],
        referral_count,
        transactions: contributionsResult, // ✅ Kritik düzeltme burada
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
