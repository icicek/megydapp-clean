// ✅ File: app/api/coincarnation/stats/route.ts

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    const { rows: participantCountRows } = await sql`SELECT COUNT(*) FROM participants`;
    const { rows: totalUsdRows } = await sql`SELECT SUM(usd_value) FROM contributions`;

    const participantCount = Number(participantCountRows[0].count || 0);
    const totalUsdValue = Number(totalUsdRows[0].sum || 0);

    return NextResponse.json({ participantCount, totalUsdValue });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
