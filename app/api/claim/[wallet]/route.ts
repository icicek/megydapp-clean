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
  context: { params: { wallet: string } }
) {
  try {
    const wallet = context.params.wallet;

    const result = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;

    const rows = result as unknown as ParticipantRow[];
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No data found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error fetching claim data:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}
