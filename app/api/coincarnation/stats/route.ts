// app/api/coincarnation/stats/route.ts

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
export const revalidate = 0;

export async function GET() {
  try {
    // Katılımcı sayısı: tüm katkı yapan cüzdanlar (deadcoin dahil)
    const participantResult = await sql`
      SELECT COUNT(DISTINCT wallet_address) AS count FROM contributions;
    `;

    // Toplam USD: DEADCOIN statüsündeki tokenler burada 0 sayılır
    const usdResult = await sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN r.status = 'deadcoin' THEN 0
          ELSE c.usd_value
        END
      ), 0) AS sum
      FROM contributions c
      LEFT JOIN token_registry r
        ON c.token_contract = r.mint;
    `;

    // Deadcoin sayısı: fiyat 0 veya statü deadcoin
    const uniqueDeadcoinsResult = await sql`
      SELECT COUNT(DISTINCT c.token_contract) AS unique_count
      FROM contributions c
      LEFT JOIN token_registry r
        ON c.token_contract = r.mint
      WHERE
        c.token_contract IS NOT NULL
        AND (
          c.usd_value = 0
          OR r.status = 'deadcoin'
        );
    `;

    const mostPopularDeadcoinResult = await sql`
      SELECT c.token_symbol, COUNT(*) AS count
      FROM contributions c
      LEFT JOIN token_registry r
        ON c.token_contract = r.mint
      WHERE
        c.token_symbol IS NOT NULL
        AND (
          c.usd_value = 0
          OR r.status = 'deadcoin'
        )
      GROUP BY c.token_symbol
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
