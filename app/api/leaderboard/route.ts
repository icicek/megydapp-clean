// app/api/leaderboard/route.ts
import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const result = await sql`
      SELECT
        p.wallet_address,
        -- Hesaplamayı yeniden yapıyoruz
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
      ORDER BY core_point DESC
      LIMIT 50;
    `;

    return NextResponse.json({ success: true, leaderboard: result });
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
