// app/api/coincarnation/stats/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const [
      participantResult,
      usdResult,
      uniqueDeadcoinsResult,
      mostPopularDeadcoinResult,
    ] = await Promise.all([
      sql`SELECT COUNT(DISTINCT wallet_address) AS count FROM contributions;`,
      // usd_value string bile olsa güvenli toplansın
      sql`SELECT COALESCE(SUM((usd_value)::numeric), 0) AS sum FROM contributions;`,
      sql`SELECT COUNT(DISTINCT token_contract) AS unique_count
          FROM contributions
          WHERE (usd_value)::numeric = 0;`,
      sql`SELECT token_symbol, COUNT(*) AS count
          FROM contributions
          WHERE (usd_value)::numeric = 0 AND token_symbol IS NOT NULL
          GROUP BY token_symbol
          ORDER BY count DESC
          LIMIT 1;`,
    ]);

    const totalParticipants = parseInt((participantResult as any)[0]?.count ?? '0', 10);
    const totalUsd = parseFloat((usdResult as any)[0]?.sum ?? 0);
    const uniqueDeadcoins = parseInt((uniqueDeadcoinsResult as any)[0]?.unique_count ?? '0', 10);
    const mostPopularDeadcoin =
      (mostPopularDeadcoinResult as any)[0]?.token_symbol || 'No deadcoin yet';

    return new NextResponse(
      JSON.stringify({
        success: true,
        totalParticipants,
        totalUsd,
        uniqueDeadcoins,
        mostPopularDeadcoin,
      }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[STATS API ERROR]', error);
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
}
