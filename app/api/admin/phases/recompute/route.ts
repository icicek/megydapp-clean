// app/api/admin/phases/recompute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { recomputeFromPhaseId } from '@/app/api/_lib/phases/recompute';

type Body = { phaseId?: number };

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req as any);

    const body = (await req.json().catch(() => ({}))) as Body;
    const phaseId = Number(body?.phaseId);

    if (!Number.isFinite(phaseId) || phaseId <= 0) {
      return NextResponse.json({ success: false, error: 'phaseId is required' }, { status: 400 });
    }

    const result = await recomputeFromPhaseId(phaseId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}
