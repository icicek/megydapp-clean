// app/api/share/record/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Sabit puan değeri
const SHARE_COREPOINT_VALUE = 30;

export async function POST(req: NextRequest) {
  try {
    const { wallet_address } = await req.json();

    if (!wallet_address) {
      return NextResponse.json({ success: false, error: 'Missing wallet address' }, { status: 400 });
    }

    // Daha önce paylaşım yapılmış mı?
    const check = await sql`
      SELECT COUNT(*) AS count FROM shares WHERE wallet_address = ${wallet_address};
    `;
    const alreadyShared = parseInt(check[0].count || '0', 10) > 0;

    if (alreadyShared) {
      return NextResponse.json({ success: false, message: 'Already shared' });
    }

    // Paylaşımı kaydet
    await sql`
      INSERT INTO shares (wallet_address)
      VALUES (${wallet_address});
    `;

    // Katılımcının mevcut breakdown bilgisi var mı?
    const coreResult = await sql`
      SELECT core_point, core_point_breakdown
      FROM participants
      WHERE wallet_address = ${wallet_address};
    `;

    if (coreResult.length > 0) {
      const currentPoint = parseFloat(coreResult[0].core_point || 0);
      const breakdown = coreResult[0].core_point_breakdown || {};
      const newBreakdown = {
        ...breakdown,
        shares: (breakdown.shares || 0) + SHARE_COREPOINT_VALUE,
      };

      const newCorePoint = currentPoint + SHARE_COREPOINT_VALUE;

      await sql`
        UPDATE participants
        SET core_point = ${newCorePoint}, core_point_breakdown = ${newBreakdown}
        WHERE wallet_address = ${wallet_address};
      `;
    }

    return NextResponse.json({ success: true, message: 'Share recorded and CorePoint updated' });
  } catch (error) {
    console.error('❌ Share record error:', error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
