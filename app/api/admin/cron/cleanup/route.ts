//app/api/admin/cron/cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  getDatabaseUrl,
} from '@/app/api/_lib/database-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSql() {
  return neon(
    getDatabaseUrl()
  );
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  try {
    const sql = getSql();

    const deletedCronRuns = await sql`
      DELETE FROM cron_runs
      WHERE ran_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `;

    const deletedTokenAudit = await sql`
      DELETE FROM token_audit
      WHERE ran_at < NOW() - INTERVAL '365 days'
      RETURNING id
    `;

    return NextResponse.json({
      ok: true,
      deleted_cron_runs: deletedCronRuns.length,
      deleted_token_audit: deletedTokenAudit.length,
      deleted_total: deletedCronRuns.length + deletedTokenAudit.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || 'cleanup_failed',
      },
      { status: 500 }
    );
  }
}