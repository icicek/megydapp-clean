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
    const rows = await sql`
      WITH per_wallet AS (
        SELECT
          wallet_address,
          COALESCE(SUM(points), 0)::float AS core_point
        FROM corepoint_events
        GROUP BY wallet_address
      ),
      ranked AS (
        SELECT
          wallet_address,
          core_point,
          RANK() OVER (ORDER BY core_point DESC) AS rank
        FROM per_wallet
      )
      SELECT core_point, rank
      FROM ranked
      WHERE wallet_address = ${wallet}
      LIMIT 1;
    `;

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        rank: null,
        core_point: 0,
      });
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
