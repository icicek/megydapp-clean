//app/api/admin/phases/advance/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { advancePhases } from '@/app/api/_lib/phases/advance';

/*
ADMIN PHASE ADVANCE ROUTE

Purpose:
- lifecycle orchestration only
- does NOT rebuild allocations
- does NOT run recompute automatically

Modern architecture:
- advance.ts   => phase lifecycle authority
- allocator.ts => allocation authority
- recompute.ts => repair/rebuild tool, should be used explicitly when needed
*/

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    const adv = await advancePhases();

    return NextResponse.json({
      success: true,
      phaseAdvance: adv,
      recompute: null,
      message:
        'Phase lifecycle advanced successfully. Allocation recompute is not triggered automatically in the modern phase architecture.',
    });
  } catch (err: unknown) {
    console.error('[advance] ERROR', err);
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}