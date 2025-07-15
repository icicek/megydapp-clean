import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const participantResult = await sql`
      SELECT COUNT(DISTINCT wallet_address) AS count FROM contributions;
    `;
    const usdResult = await sql`
      SELECT COALESCE(SUM(usd_value), 0) AS sum FROM contributions;
    `;
    const uniqueDeadcoinsResult = await sql`
      SELECT COUNT(DISTINCT token_contract) AS unique_deadcoins
      FROM contributions
      WHERE usd_value = 0;
    `;
    const mostPopularDeadcoinResult = await sql`
      SELECT token_symbol, COUNT(*) AS count
      FROM contributions
      WHERE usd_value = 0
      GROUP BY token_symbol
      ORDER BY count DESC
      LIMIT 1;
    `;

    const totalParticipants = parseInt(participantResult[0].count || '0', 10);
    const totalUsd = parseFloat(usdResult[0].sum || '0');
    const uniqueDeadcoins = parseInt(uniqueDeadcoinsResult[0].unique_deadcoins || '0', 10);
    const mostPopularDeadcoin = mostPopularDeadcoinResult[0]?.token_symbol || 'N/A';

    return NextResponse.json({
      success: true,
      totalParticipants,
      totalUsd,
      uniqueDeadcoins,
      mostPopularDeadcoin,
    });
  } catch (error) {
    console.error('[STATS API ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
