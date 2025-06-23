import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const participantResult = await sql`
      SELECT COUNT(DISTINCT wallet_address) AS count FROM contributions;
    `;
    const usdResult = await sql`
      SELECT COALESCE(SUM(usd_value), 0) AS sum FROM contributions;
    `;

    const totalParticipants = parseInt(participantResult[0].count || '0', 10);
    const totalUsd = parseFloat(usdResult[0].sum || '0');

    return NextResponse.json({
      success: true,
      totalParticipants,
      totalUsd,
    });
  } catch (error) {
    console.error('[STATS API ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
