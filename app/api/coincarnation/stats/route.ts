import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    const [{ count }] = (await sql`SELECT COUNT(*) FROM participants`).rows;
    const [{ sum }] = (await sql`SELECT SUM(usd_value) FROM contributions`).rows;

    const participantCount = parseInt(count || '0', 10);
    const totalUsdValue = parseFloat(sum || '0');

    return NextResponse.json({ participantCount, totalUsdValue });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
