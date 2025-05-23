// ✅ File: app/api/admin/snapshot/route.ts

import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// ✅ Cüzdan adresi admin kontrolü için kullanılır
const ADMIN_WALLET = process.env.ADMIN_WALLET?.toLowerCase();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { wallet } = body;

    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // Toplam dağıtılacak MEGY miktarını config tablosundan al
    const { rows }: { rows: { value: string }[] } = await sql`
      SELECT value FROM config WHERE key = 'distribution_pool' LIMIT 1;
    `;

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Config not found' }, { status: 500 });
    }

    const distributionPool = parseFloat(rows[0].value);

    // Toplam usd_value hesapla
    const { rows: totalRows }: { rows: { total: number }[] } = await sql`
      SELECT SUM(usd_value)::float as total FROM participants;
    `;

    const totalUsd = totalRows[0]?.total;

    if (!totalUsd || totalUsd === 0) {
      return NextResponse.json({ success: false, error: 'Total USD value is zero' }, { status: 400 });
    }

    // claimable_amount güncelle
    await sql`
      UPDATE participants
      SET claimable_amount = (usd_value / ${totalUsd}) * ${distributionPool};
    `;

    return NextResponse.json({ success: true, message: 'Snapshot complete' });
  } catch (err) {
    console.error('Snapshot error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
