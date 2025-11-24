// app/api/leaderboard/route.ts
import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    // Her cüzdan için toplam CorePoint (corepoint_events tablosundan)
    const rows = await sql`
      SELECT
        wallet_address,
        COALESCE(SUM(points), 0)::float AS core_point
      FROM corepoint_events
      GROUP BY wallet_address
      HAVING COALESCE(SUM(points), 0) > 0
      ORDER BY core_point DESC
      LIMIT 50;
    `;

    return NextResponse.json({
      success: true,
      leaderboard: rows,
    });
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}
