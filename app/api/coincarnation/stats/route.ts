import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const participantResult = await sql`SELECT COUNT(*) AS count FROM participants`;
    const usdResult = await sql`SELECT COALESCE(SUM(usd_value), 0) AS sum FROM contributions`;

    const participantCount = parseInt(participantResult[0].count || '0', 10);
    const totalUsdValue = parseFloat(usdResult[0].sum || '0');

    return NextResponse.json({ participantCount, totalUsdValue });
  } catch (error) {
    console.error('[STATS API ERROR]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
