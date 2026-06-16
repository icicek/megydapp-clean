// app/api/admin/config/cron_enabled/route.ts

import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseBoolLoose(v: unknown, def = true): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;

  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  }

  return def;
}

function normalizeBoolString(v: unknown): 'true' | 'false' {
  return parseBoolLoose(v, true) ? 'true' : 'false';
}

export async function GET() {
  try {
    const rows = (await sql`
      SELECT value
      FROM admin_config
      WHERE key = 'cron_enabled'
      LIMIT 1
    `) as unknown as { value: any }[];

    const raw = rows?.[0]?.value;
    const value =
      raw && typeof raw === 'object' && raw.value != null
        ? parseBoolLoose(raw.value, true)
        : parseBoolLoose(raw, true);

    return NextResponse.json({
      success: true,
      value,
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req as any);
    verifyCsrf(req as any);

    const body = await req.json().catch(() => ({}));
    const normalized = normalizeBoolString(body?.value);

    const rows = (await sql`
      INSERT INTO admin_config (key, value, updated_at)
      VALUES (
        'cron_enabled',
        ${JSON.stringify({ value: normalized })}::jsonb,
        NOW()
      )
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
      RETURNING value
    `) as unknown as { value: any }[];

    const raw = rows?.[0]?.value;
    const value =
      raw && typeof raw === 'object' && raw.value != null
        ? parseBoolLoose(raw.value, true)
        : parseBoolLoose(raw, true);

    return NextResponse.json({
      success: true,
      value,
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}