// app/api/crons/reclassify/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: 'deprecated_endpoint',
      message:
        'This endpoint is deprecated. Use POST /api/admin/reclassify with X-CRON-SECRET.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}

// (İstersen POST da ekleyip 410 döndürebiliriz; GET zaten eski kullanım.)
