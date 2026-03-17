//app/api/admin/refunds/list/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAdmin, HttpError } from '@/app/api/_lib/jwt';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const rows = (await sql/* sql */`
      SELECT
        ci.id,
        ci.contribution_id,
        ci.wallet_address,
        ci.mint,
        ci.invalidated_token_amount,
        ci.reason,
        ci.refund_status,
        ci.requested_at,
        ci.refunded_at,
        ci.refund_fee_paid,
        ci.refund_fee_lamports,
        ci.refund_fee_tx_signature,
        ci.refund_tx_signature,
        ci.executed_by,
        ci.created_at,
        ci.updated_at,
        c.token_symbol,
        c.network,
        c.transaction_signature
      FROM contribution_invalidations ci
      LEFT JOIN contributions c
        ON c.id = ci.contribution_id
      WHERE ci.refund_status IN ('requested', 'refunded', 'available')
      ORDER BY
        CASE
          WHEN ci.refund_status = 'requested' THEN 0
          WHEN ci.refund_status = 'available' THEN 1
          WHEN ci.refund_status = 'refunded' THEN 2
          ELSE 9
        END,
        ci.requested_at DESC NULLS LAST,
        ci.created_at DESC,
        ci.id DESC
    `) as any[];

    return NextResponse.json({
      success: true,
      refunds: rows ?? [],
    });
  } catch (err: any) {
    console.error('admin refunds list failed:', err);

    if (err instanceof HttpError) {
      return NextResponse.json(
        { success: false, error: err.code || 'AUTH_ERROR' },
        { status: err.status }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}