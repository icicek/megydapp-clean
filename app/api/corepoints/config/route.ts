// app/api/corepoints/config/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCorepointWeights } from '@/app/api/_lib/corepoints';

export async function GET(_req: NextRequest) {
  try {
    const cfg = await getCorepointWeights();

    return NextResponse.json({
      success: true,
      config: cfg,
    });
  } catch (e: any) {
    console.error('❌ /api/corepoints/config failed:', e?.message || e);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
