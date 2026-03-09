// app/api/admin/snapshot/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';

// NOTE:
// This route is kept only for backward compatibility.
// It does NOT represent the phase snapshot system.
// It simply reads a legacy admin_config value: distribution_pool.

function asRows<T = any>(r: any): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && Array.isArray((r as any).rows)) return (r as any).rows as T[];
  return [];
}

function unwrapJsonbValue(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'value' in (raw as any)) {
    return (raw as any).value;
  }
  return raw;
}

function normalizeNumericString(v: unknown): string {
  if (v == null) return '0';
  const s = String(v).trim();
  if (!s) return '0';
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : '0';
}

export async function GET() {
  try {
    const key = 'distribution_pool';

    const res = await sql/* sql */`
      SELECT value
      FROM admin_config
      WHERE key = ${key}
      LIMIT 1
    `;

    const row = asRows<{ value?: unknown }>(res)[0] ?? null;
    const raw = unwrapJsonbValue(row?.value);
    const value = normalizeNumericString(raw);

    return NextResponse.json({
      success: true,
      key,
      value,
      source: 'admin_config',
      legacy: true,
      message:
        'This route returns a legacy distribution_pool config value. It is not the phase snapshot endpoint.',
    });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}