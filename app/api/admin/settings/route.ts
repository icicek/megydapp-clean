// app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import {
  getVoteThreshold,
  invalidateVoteThresholdCache,
  getIncludeCex,
  invalidateIncludeCexCache,
} from '@/app/api/_lib/settings';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [voteThreshold, includeCEX] = await Promise.all([
      getVoteThreshold(),
      getIncludeCex(),
    ]);
    return NextResponse.json({ success: true, voteThreshold, includeCEX });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminWallet = await requireAdmin(req as any);
    verifyCsrf(req as any);

    const body = await req.json();

    // Opsiyonel alanlar: voteThreshold (1..50), includeCEX (boolean)
    const updates: Array<Promise<any>> = [];

    if (body.hasOwnProperty('voteThreshold')) {
      const t = Number.parseInt(String(body.voteThreshold ?? ''), 10);
      if (!Number.isFinite(t) || t < 1 || t > 50) {
        return NextResponse.json({ success: false, error: 'Invalid voteThreshold (1–50)' }, { status: 400 });
      }
      updates.push(sql`
        INSERT INTO admin_config (key, value, updated_by)
        VALUES ('vote_threshold', ${ { value: t } }, ${adminWallet})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_by = ${adminWallet}, updated_at = now()
      `);
    }

    if (body.hasOwnProperty('includeCEX')) {
      const v = !!body.includeCEX;
      updates.push(sql`
        INSERT INTO admin_config (key, value, updated_by)
        VALUES ('include_cex', ${ { value: v } }, ${adminWallet})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_by = ${adminWallet}, updated_at = now()
      `);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid setting provided' }, { status: 400 });
    }

    await Promise.all(updates);

    // Cache’leri invalid et
    if (body.hasOwnProperty('voteThreshold')) invalidateVoteThresholdCache();
    if (body.hasOwnProperty('includeCEX')) invalidateIncludeCexCache();

    const [voteThreshold, includeCEX] = await Promise.all([
      getVoteThreshold(),
      getIncludeCex(),
    ]);

    return NextResponse.json({ success: true, voteThreshold, includeCEX });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
