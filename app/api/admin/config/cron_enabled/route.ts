// app/api/admin/config/cron_enabled/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { requireAdmin } from '@/app/api/_lib/jwt';

function parseBoolLoose(v: unknown, def: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return def;
  const s = v.trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return def;
}

// GET → current value
export async function GET() {
  try {
    const res = await sql/* sql */`
      SELECT value FROM config WHERE key = 'cron_enabled' LIMIT 1;
    `;
    const raw = (Array.isArray(res) ? res : (res as any).rows)?.[0]?.value ?? 'true';
    const value = typeof raw === 'string' ? raw : String(raw);
    return NextResponse.json({ success: true, value });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}

// POST → set value (admin only)
export async function POST(req: Request) {
  try {
    await requireAdmin(req as any);

    const body = await req.json().catch(() => ({}));
    const next = parseBoolLoose(body?.value, true) ? 'true' : 'false';

    await sql/* sql */`
      INSERT INTO config (key, value)
      VALUES ('cron_enabled', ${next})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    `;

    return NextResponse.json({ success: true, value: next });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
