import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
export const revalidate = 0;

export async function GET() {
  try {
    const participantResult = await sql`
      SELECT COUNT(DISTINCT wallet_address) AS count FROM contributions;
    `;
    const usdResult = await sql`
      SELECT COALESCE(SUM(usd_value), 0) AS sum FROM contributions;
    `;
    const uniqueDeadcoinsResult = await sql`
      SELECT COUNT(DISTINCT token_contract) AS unique_count
      FROM contributions
      WHERE usd_value = 0;
    `;
    const mostPopularDeadcoinResult = await sql`
      SELECT token_symbol, COUNT(*) AS count
      FROM contributions
      WHERE usd_value = 0 AND token_symbol IS NOT NULL
      GROUP BY token_symbol
      ORDER BY count DESC
      LIMIT 1;
    `;

    const res = NextResponse.json({
      success: true,
      totalParticipants: Number(participantResult[0]?.count ?? 0),
      totalUsd: Number(usdResult[0]?.sum ?? 0),
      uniqueDeadcoins: Number(uniqueDeadcoinsResult[0]?.unique_count ?? 0),
      mostPopularDeadcoin: mostPopularDeadcoinResult[0]?.token_symbol || 'No deadcoin yet',
    });
    res.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res;
  } catch (error) {
    console.error('[STATS API ERROR]', error);
    const res = NextResponse.json(
      {
        success: true, // degrade: UI kırılmasın
        degraded: true,
        totalParticipants: 0,
        totalUsd: 0,
        uniqueDeadcoins: 0,
        mostPopularDeadcoin: 'No deadcoin yet',
      },
      { status: 200 }
    );
    res.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res;
  }
}
