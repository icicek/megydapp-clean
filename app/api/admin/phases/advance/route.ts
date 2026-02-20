export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { advancePhases } from '@/app/api/_lib/phases/advance';
import { recomputeFromPhaseId } from '@/app/api/_lib/phases/recompute';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    // 1) Advance (reviewing/open planned, move queue)
    const adv = await advancePhases();

    // 2) Recompute from earliest affected point
    const fromId =
      (adv.openedPhaseIds?.length ? adv.openedPhaseIds[0] : null) ??
      (adv.activePhaseId ?? null);

    const recompute = fromId ? await recomputeFromPhaseId(Number(fromId)) : null;

    return NextResponse.json({
      success: true,
      phaseAdvance: adv,
      recompute,
    });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
