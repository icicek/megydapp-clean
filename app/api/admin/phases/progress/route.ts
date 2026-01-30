// app/api/admin/phases/progress/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

async function pickUsdColumn(): Promise<string> {
  // phase_allocations tablosunda usd kolonu isimleri projeden projeye değişebiliyor.
  // Bu yüzden information_schema'dan kontrol edip en uygununu seçiyoruz.
  const cols = (await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'phase_allocations'
  `) as any[];

  const set = new Set((cols || []).map((c) => String(c.column_name)));

  const candidates = ['usd_sum', 'usd_value', 'usd_amount', 'usd'];
  for (const c of candidates) {
    if (set.has(c)) return c;
  }
  // fallback: yoksa 0 döneceğiz
  return '';
}

async function pickWalletColumn(): Promise<string> {
  const cols = (await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'phase_allocations'
  `) as any[];

  const set = new Set((cols || []).map((c) => String(c.column_name)));

  const candidates = ['wallet_address', 'wallet', 'address'];
  for (const c of candidates) {
    if (set.has(c)) return c;
  }
  return '';
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    const usdCol = await pickUsdColumn();
    const walletCol = await pickWalletColumn();

    // USD kolonu bulunamazsa yine de bozmadan boş result döndürelim
    if (!usdCol) {
      return NextResponse.json({ success: true, rows: [] });
    }

    // Dinamik kolon ismi için identifier injection riskine karşı:
    // information_schema'dan gelen isim zaten whitelist candidates içinden seçiliyor.
    const usdIdent = sql(usdCol as any);

    if (walletCol) {
      const walletIdent = sql(walletCol as any);
      const rows = (await sql`
        SELECT
          p.id as phase_id,
          COALESCE(SUM(${usdIdent}), 0) as alloc_usd_sum,
          COALESCE(COUNT(DISTINCT ${walletIdent}), 0) as alloc_wallets
        FROM phases p
        LEFT JOIN phase_allocations a
          ON a.phase_id = p.id
        GROUP BY p.id
        ORDER BY p.id ASC;
      `) as any[];

      return NextResponse.json({ success: true, rows });
    }

    // wallet kolonu yoksa sadece usd_sum döndür
    const rows = (await sql`
      SELECT
        p.id as phase_id,
        COALESCE(SUM(${usdIdent}), 0) as alloc_usd_sum,
        0 as alloc_wallets
      FROM phases p
      LEFT JOIN phase_allocations a
        ON a.phase_id = p.id
      GROUP BY p.id
      ORDER BY p.id ASC;
    `) as any[];

    return NextResponse.json({ success: true, rows });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}