import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    const { rows: participantRows } = await sql`SELECT COUNT(*) AS count FROM participants`;
    const { rows: usdRows } = await sql`SELECT COALESCE(SUM(usd_value), 0) AS sum FROM contributions`;

    const participantCount = parseInt(participantRows[0].count || '0', 10);
    const totalUsdValue = parseFloat(usdRows[0].sum || '0');

    return NextResponse.json({ participantCount, totalUsdValue });
  } catch (error) {
    console.error('[STATS API ERROR]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
