// app/api/admin/snapshot/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';

// Normalize result shapes (neon returns arrays; pg may return { rows: [...] })
function asRows<T = any>(r: any): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && Array.isArray((r as any).rows)) return (r as any).rows as T[];
  return [];
}

// admin_config.value JSONB wrapper -> extract primitive safely
function unwrapValue(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'value' in (raw as any)) {
    return (raw as any).value;
  }
  return raw;
}

export async function GET() {
  try {
    const key = 'distribution_pool';

    // admin_config: value JSONB (usually { value: <something> })
    const res = await sql/* sql */`
      SELECT value
      FROM admin_config
      WHERE key = ${key}
      LIMIT 1
    `;

    const row = asRows<{ value?: unknown }>(res)[0];
    const unwrapped = unwrapValue(row?.value);

    // normalize to string number (UI expects string or numeric; we return string here)
    const str = unwrapped == null ? '0' : String(unwrapped);
    const n = Number(str);

    // If invalid, fallback to "0" (do not break UI)
    const value = Number.isFinite(n) ? String(n) : '0';

    return NextResponse.json({ success: true, value });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
