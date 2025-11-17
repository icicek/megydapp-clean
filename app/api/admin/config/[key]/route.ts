// app/api/admin/config/[key]/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '@/app/api/_lib/jwt';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

// URL'den [key] segmentini alan küçük helper
function getKeyFromRequest(req: NextRequest): string {
  // /api/admin/config/[key] -> son segment [key]
  const path = req.nextUrl?.pathname ?? new URL(req.url).pathname;
  const parts = path.split('/').filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || '');
}

// GET /api/admin/config/[key]
export async function GET(req: NextRequest) {
  // 🔐 sadece admin
  await requireAdmin(req);

  const key = getKeyFromRequest(req);

  const rows = await sql`
    SELECT value
    FROM admin_config
    WHERE key = ${key}
    LIMIT 1
  `;

  if (!rows[0]) {
    return NextResponse.json({ success: true, value: null });
  }

  return NextResponse.json({
    success: true,
    value: rows[0].value,
  });
}

// PUT /api/admin/config/[key]
export async function PUT(req: NextRequest) {
  // 🔐 sadece admin
  await requireAdmin(req);

  const key = getKeyFromRequest(req);
  const body = await req.json().catch(() => null);
  const val = body?.value ?? null;

  await sql`
    INSERT INTO admin_config (key, value)
    VALUES (${key}, ${val})
    ON CONFLICT (key)
    DO UPDATE SET value = ${val}
  `;

  return NextResponse.json({
    success: true,
    value: val,
  });
}
