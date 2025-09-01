// app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { getVoteThreshold, invalidateVoteThresholdCache } from '@/app/api/_lib/settings';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const voteThreshold = await getVoteThreshold();
    return NextResponse.json({ success: true, voteThreshold });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    // admin & CSRF
    const adminWallet = await requireAdmin(req as any);
    verifyCsrf(req as any);

    const body = await req.json();
    const t = Number.parseInt(String(body?.voteThreshold ?? ''), 10);
    if (!Number.isFinite(t) || t < 1 || t > 50) {
      return NextResponse.json({ success: false, error: 'Invalid voteThreshold (1–50)' }, { status: 400 });
    }

    await sql`
      INSERT INTO admin_config (key, value, updated_by)
      VALUES ('vote_threshold', ${ { value: t } }, ${adminWallet})
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_by = ${adminWallet}, updated_at = now()
    `;

    invalidateVoteThresholdCache();
    return NextResponse.json({ success: true, voteThreshold: t });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
