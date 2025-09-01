// app/api/admin/snapshot/route.ts
import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { httpErrorFrom } from '@/app/api/_lib/http';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    // Toplam dağıtılacak MEGY miktarını config tablosundan al
    const result = await sql`
      SELECT value FROM config WHERE key = 'distribution_pool' LIMIT 1;
    `;
    const rows = result as { value: string }[];
    const value = rows[0]?.value ?? '0';

    return NextResponse.json({ success: true, value });
  } catch (err: any) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
