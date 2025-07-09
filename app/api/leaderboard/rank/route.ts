import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ success: false, error: 'Missing wallet param' }, { status: 400 });
  }

  try {
    const result = await sql`
      WITH ranked AS (
        SELECT
          wallet_address,
          -- CorePoint hesaplaması
          COALESCE((
            (SELECT SUM(usd_value) FROM contributions WHERE wallet_address = p.wallet_address) * 100
          ), 0) +
          COALESCE((
            (SELECT COUNT(*) FROM contributions WHERE referrer_wallet = p.wallet_address) * 100
          ), 0) +
          COALESCE((
            (SELECT SUM(usd_value) FROM contributions WHERE referrer_wallet = p.wallet_address) * 50
          ), 0) +
          COALESCE((
            (SELECT COUNT(DISTINCT token_contract) FROM contributions WHERE wallet_address = p.wallet_address AND usd_value = 0) * 100
          ), 0) +
          COALESCE((
            (SELECT COUNT(DISTINCT token_contract) FROM contributions WHERE referrer_wallet = p.wallet_address AND usd_value = 0) * 100
          ), 0) +
          COALESCE((
            CASE WHEN EXISTS (SELECT 1 FROM shares WHERE wallet_address = p.wallet_address) THEN 30 ELSE 0 END
          ), 0)
          AS core_point
        FROM participants p
      )
      SELECT
        core_point,
        RANK() OVER (ORDER BY core_point DESC) AS rank
      FROM ranked
      WHERE wallet_address = ${wallet};
    `;

    if (result.length === 0) {
      return NextResponse.json({ success: false, rank: null, core_point: 0 });
    }

    return NextResponse.json({
      success: true,
      rank: result[0].rank,
      core_point: result[0].core_point,
    });
  } catch (err) {
    console.error('Rank fetch error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
