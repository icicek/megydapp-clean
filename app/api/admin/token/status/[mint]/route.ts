import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(
  req: NextRequest,
  { params }: { params: { mint: string } }
) {
  const { mint } = params;

  try {
    const rows = await sql`
      SELECT 
        mint, 
        symbol,
        status, 
        redlist_date, 
        deadcoin_votes, 
        last_price, 
        last_price_sources, 
        last_price_updated
      FROM tokens
      WHERE mint = ${mint}
    `;

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: null
      });
    }

    return NextResponse.json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.error('❌ Error fetching token status:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
