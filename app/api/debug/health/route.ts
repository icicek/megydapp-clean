// app/api/debug/health/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// İsteği kesinlikle GET ile karşılayalım
export async function GET(req: Request) {
  // Opsiyonel: DEBUG_SECRET set ise header doğrula
  const need = process.env.DEBUG_SECRET || '';
  const got  = req.headers.get('x-debug-secret') || '';

  if (need && got !== need) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', hint: 'send X-DEBUG-SECRET' },
      { status: 401 }
    );
  }

  // Basit, bağımsız sağlık çıktısı
  return NextResponse.json({
    ok: true,
    path: '/api/debug/health',
    now: new Date().toISOString(),
    node: process.version,
    envs: {
      has_DEBUG_SECRET: Boolean(process.env.DEBUG_SECRET),
      has_DB_URL: Boolean(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
      cron_enabled_env: process.env.CRON_ENABLED ?? null,
    },
  });
}
