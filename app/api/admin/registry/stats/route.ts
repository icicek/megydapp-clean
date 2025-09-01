// app/api/admin/registry/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    // 1) Status dağılımı
    const byRes = await sql`
      SELECT status::text AS status, COUNT(*)::int AS count
      FROM token_registry
      GROUP BY status
    `;

    // 2) Toplam
    const totalRes = await sql`
      SELECT COUNT(*)::int AS count FROM token_registry
    `;

    // 3) En son güncelleme
    const lastRes = await sql`
      SELECT MAX(updated_at) AS ts FROM token_registry
    `;

    // Parse results safely
    const byStatus: Record<string, number> = {};
    for (const r of (byRes as any[])) {
      const status = String(r.status);
      const count = Number(r.count) || 0;
      byStatus[status] = count;
    }

    const total = Number((totalRes as any[])[0]?.count ?? 0) || 0;

    const lastRaw = (lastRes as any[])[0]?.ts ?? null;
    const lastUpdatedAt = lastRaw ? new Date(lastRaw).toISOString() : null;

    return NextResponse.json({
      success: true,
      total,
      byStatus,
      lastUpdatedAt,
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
