// app/api/admin/phases/[id]/claim-preview/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

function toId(params: any): number {
  const id = Number(params?.id);
  return Number.isFinite(id) ? id : 0;
}

export async function GET(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const phaseId = toId(ctx?.params);
    if (!phaseId) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    // Phase
    const ph = (await sql`
      SELECT id, phase_no, name, status, snapshot_taken_at, opened_at, closed_at, rate_usd_per_megy
      FROM phases
      WHERE id = ${phaseId}
      LIMIT 1;
    `) as any[];

    if (!ph?.[0]) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
    }

    // Alloc totals
    const alloc = (await sql`
      SELECT
        COUNT(*)::int AS n_rows,
        COUNT(DISTINCT wallet_address)::int AS n_wallets,
        COALESCE(SUM(usd_allocated),0)::numeric AS usd_sum,
        COALESCE(SUM(megy_allocated),0)::numeric AS megy_sum
      FROM phase_allocations
      WHERE phase_id = ${phaseId};
    `) as any[];

    // Claim totals
    const snap = (await sql`
      SELECT
        COUNT(*)::int AS n_wallets,
        COALESCE(SUM(contribution_usd),0)::numeric AS usd_sum,
        COALESCE(SUM(megy_amount),0)::numeric AS megy_sum,
        COALESCE(SUM(share_ratio),0)::numeric AS share_ratio_sum
      FROM claim_snapshots
      WHERE phase_id = ${phaseId};
    `) as any[];

    // Top 50 preview
    const top = (await sql`
      SELECT
        wallet_address,
        megy_amount,
        contribution_usd,
        share_ratio,
        claim_status,
        created_at
      FROM claim_snapshots
      WHERE phase_id = ${phaseId}
      ORDER BY megy_amount DESC, contribution_usd DESC
      LIMIT 50;
    `) as any[];

    return NextResponse.json({
      success: true,
      phase: ph[0],
      totals: {
        allocations: alloc?.[0] ?? null,
        claimSnapshots: snap?.[0] ?? null,
      },
      top,
      message: '✅ Claim preview ready (read-only).',
    });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}