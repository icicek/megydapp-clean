// app/api/leaderboard/rank/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json(
      { success: false, error: 'Missing wallet param' },
      { status: 400 },
    );
  }

  try {
    const rows = await sql/* sql */`
      WITH aggregated AS (
        SELECT
          p.wallet_address,
          COALESCE(SUM(e.points), 0)::float AS core_point
        FROM participants p
        LEFT JOIN corepoint_events e
          ON e.wallet_address = p.wallet_address
        GROUP BY p.wallet_address
      ),
      ranked AS (
        SELECT
          wallet_address,
          core_point,
          RANK() OVER (ORDER BY core_point DESC) AS rank
        FROM aggregated
      )
      SELECT core_point, rank
      FROM ranked
      WHERE wallet_address = ${wallet};
    `;

    if (rows.length === 0) {
      return NextResponse.json({ success: false, rank: null, core_point: 0 });
    }

    return NextResponse.json({
      success: true,
      rank: rows[0].rank,
      core_point: rows[0].core_point,
    });
  } catch (err) {
    console.error('Rank fetch error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}
