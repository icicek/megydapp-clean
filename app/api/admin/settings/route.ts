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
  getClassificationThresholds,
  invalidateClassificationThresholds,
} from '@/app/api/_lib/settings';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [voteThreshold, includeCEX, cls] = await Promise.all([
      getVoteThreshold(),
      getIncludeCex(),
      getClassificationThresholds(),
    ]);

    return NextResponse.json({
      success: true,
      voteThreshold,
      includeCEX,
      ...cls, // { healthyMinVolUSD, healthyMinLiqUSD, walkingDeadMinVolUSD, walkingDeadMinLiqUSD }
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

function isNum(n: any) {
  return typeof n === 'number' && Number.isFinite(n);
}

export async function PUT(req: NextRequest) {
  try {
    const adminWallet = await requireAdmin(req as any);
    verifyCsrf(req as any);

    const body = await req.json();

    // Opsiyonel alanlar:
    // - voteThreshold (1..50)
    // - includeCEX (boolean)
    // - healthyMinVolUSD, healthyMinLiqUSD, walkingDeadMinVolUSD, walkingDeadMinLiqUSD  (>=0)
    type Update = Promise<any>;
    const updates: Update[] = [];

    // voteThreshold
    if (Object.prototype.hasOwnProperty.call(body, 'voteThreshold')) {
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

    // includeCEX
    if (Object.prototype.hasOwnProperty.call(body, 'includeCEX')) {
      const v = !!body.includeCEX;
      updates.push(sql`
        INSERT INTO admin_config (key, value, updated_by)
        VALUES ('include_cex', ${ { value: v } }, ${adminWallet})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_by = ${adminWallet}, updated_at = now()
      `);
    }

    // classification thresholds
    const H_VOL = body?.healthyMinVolUSD;
    const H_LIQ = body?.healthyMinLiqUSD;
    const WD_VOL = body?.walkingDeadMinVolUSD;
    const WD_LIQ = body?.walkingDeadMinLiqUSD;

    // Her biri varsa sayı ve ≥ 0 olsun
    if (Object.prototype.hasOwnProperty.call(body, 'healthyMinVolUSD')) {
      if (!isNum(H_VOL) || H_VOL < 0) {
        return NextResponse.json({ success: false, error: 'healthyMinVolUSD must be a number ≥ 0' }, { status: 400 });
      }
      updates.push(sql`
        INSERT INTO admin_config (key, value, updated_by)
        VALUES ('healthy_min_vol_usd', ${ { value: H_VOL } }, ${adminWallet})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_by = ${adminWallet}, updated_at = now()
      `);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'healthyMinLiqUSD')) {
      if (!isNum(H_LIQ) || H_LIQ < 0) {
        return NextResponse.json({ success: false, error: 'healthyMinLiqUSD must be a number ≥ 0' }, { status: 400 });
      }
      updates.push(sql`
        INSERT INTO admin_config (key, value, updated_by)
        VALUES ('healthy_min_liq_usd', ${ { value: H_LIQ } }, ${adminWallet})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_by = ${adminWallet}, updated_at = now()
      `);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'walkingDeadMinVolUSD')) {
      if (!isNum(WD_VOL) || WD_VOL < 0) {
        return NextResponse.json({ success: false, error: 'walkingDeadMinVolUSD must be a number ≥ 0' }, { status: 400 });
      }
      updates.push(sql`
        INSERT INTO admin_config (key, value, updated_by)
        VALUES ('walking_dead_min_vol_usd', ${ { value: WD_VOL } }, ${adminWallet})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_by = ${adminWallet}, updated_at = now()
      `);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'walkingDeadMinLiqUSD')) {
      if (!isNum(WD_LIQ) || WD_LIQ < 0) {
        return NextResponse.json({ success: false, error: 'walkingDeadMinLiqUSD must be a number ≥ 0' }, { status: 400 });
      }
      updates.push(sql`
        INSERT INTO admin_config (key, value, updated_by)
        VALUES ('walking_dead_min_liq_usd', ${ { value: WD_LIQ } }, ${adminWallet})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_by = ${adminWallet}, updated_at = now()
      `);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid setting provided' }, { status: 400 });
    }

    // (Opsiyonel) ilişki doğrulaması: WD eşikleri healthy'yi aşmamalı
    if (isNum(H_VOL) && isNum(WD_VOL) && WD_VOL > H_VOL) {
      return NextResponse.json({ success: false, error: 'walkingDeadMinVolUSD must be ≤ healthyMinVolUSD' }, { status: 400 });
    }
    if (isNum(H_LIQ) && isNum(WD_LIQ) && WD_LIQ > H_LIQ) {
      return NextResponse.json({ success: false, error: 'walkingDeadMinLiqUSD must be ≤ healthyMinLiqUSD' }, { status: 400 });
    }

    await Promise.all(updates);

    // Cache invalidation
    if (Object.prototype.hasOwnProperty.call(body, 'voteThreshold')) invalidateVoteThresholdCache();
    if (Object.prototype.hasOwnProperty.call(body, 'includeCEX')) invalidateIncludeCexCache();
    if (
      Object.prototype.hasOwnProperty.call(body, 'healthyMinVolUSD') ||
      Object.prototype.hasOwnProperty.call(body, 'healthyMinLiqUSD') ||
      Object.prototype.hasOwnProperty.call(body, 'walkingDeadMinVolUSD') ||
      Object.prototype.hasOwnProperty.call(body, 'walkingDeadMinLiqUSD')
    ) {
      invalidateClassificationThresholds();
    }

    const [voteThreshold, includeCEX, cls] = await Promise.all([
      getVoteThreshold(),
      getIncludeCex(),
      getClassificationThresholds(),
    ]);

    return NextResponse.json({ success: true, voteThreshold, includeCEX, ...cls });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
