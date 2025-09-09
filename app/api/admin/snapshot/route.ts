// app/api/admin/snapshot/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';

// Normalize result shapes (neon returns arrays; pg may return { rows: [...] })
function asRows<T = any>(r: any): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && Array.isArray(r.rows)) return r.rows as T[];
  return [];
}

export async function GET() {
  try {
    // Read total distributable MEGY from config table
    const res = await sql/* sql */`
      SELECT value FROM config WHERE key = 'distribution_pool' LIMIT 1;
    `;
    const raw = asRows<{ value: unknown }>(res)[0]?.value ?? '0';
    const value = typeof raw === 'string' ? raw : String(raw);

    return NextResponse.json({ success: true, value });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
