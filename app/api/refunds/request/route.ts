//app/api/refunds/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const wallet = String(body?.wallet_address || '').trim();
    const contributionId = Number(body?.contribution_id);
    const mint = String(body?.mint || '').trim();

    if (!wallet || !Number.isFinite(contributionId) || contributionId <= 0 || !mint) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const found = (await sql/* sql */`
      SELECT id, refund_status
      FROM contribution_invalidations
      WHERE contribution_id = ${contributionId}
        AND wallet_address = ${wallet}
        AND mint = ${mint}
      ORDER BY created_at DESC
      LIMIT 1
    `) as any[];

    const row = found?.[0];
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'REFUND_NOT_AVAILABLE' },
        { status: 404 }
      );
    }

    const current = String(row.refund_status || '');
    if (current === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REFUNDED' },
        { status: 409 }
      );
    }

    if (current === 'requested') {
      return NextResponse.json({
        success: true,
        already_requested: true,
        contribution_id: contributionId,
        refund_status: 'requested',
      });
    }

    await sql/* sql */`
      UPDATE contribution_invalidations
      SET
        refund_status = 'requested',
        requested_at = COALESCE(requested_at, NOW()),
        updated_at = NOW()
      WHERE contribution_id = ${contributionId}
        AND wallet_address = ${wallet}
        AND mint = ${mint}
        AND refund_status = 'available'
    `;

    return NextResponse.json({
      success: true,
      contribution_id: contributionId,
      refund_status: 'requested',
    });
  } catch (err) {
    console.error('refund request failed:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}