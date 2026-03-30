//app/api/admin/cron/cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sql = neon(process.env.NEON_DATABASE_URL!);

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const res = await sql`
      DELETE FROM cron_runs
      WHERE ran_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `;

    return NextResponse.json({
      ok: true,
      deleted: res.length,
    });

  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e.message,
    }, { status: 500 });
  }
}