// app/api/leaderboard/route.ts
import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const rows = await sql/* sql */`
      SELECT
        p.wallet_address,
        COALESCE(SUM(e.points), 0)::float AS core_point
      FROM participants p
      LEFT JOIN corepoint_events e
        ON e.wallet_address = p.wallet_address
      GROUP BY p.wallet_address
      ORDER BY core_point DESC, p.id ASC
      LIMIT 50;
    `;

    return NextResponse.json({ success: true, leaderboard: rows });
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}
