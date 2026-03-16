//app/api/refunds/fee/prepare/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getRefundFeeLamports } from '@/app/api/_lib/refund-config';

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

    const rows = (await sql/* sql */`
      SELECT
        contribution_id,
        wallet_address,
        mint,
        invalidated_token_amount,
        reason,
        refund_status,
        refund_fee_paid
      FROM contribution_invalidations
      WHERE contribution_id = ${contributionId}
        AND wallet_address = ${wallet}
        AND mint = ${mint}
      ORDER BY created_at DESC
      LIMIT 1
    `) as any[];

    const row = rows?.[0];
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'REFUND_NOT_AVAILABLE' },
        { status: 404 }
      );
    }

    const refundStatus = String(row.refund_status || '');
    const refundFeePaid = Boolean(row.refund_fee_paid);
    const reason = String(row.reason || '');

    if (refundStatus === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REFUNDED' },
        { status: 409 }
      );
    }

    // Only blacklist-based invalidations should be refundable
    if (reason.toLowerCase() !== 'blacklist') {
      return NextResponse.json(
        { success: false, error: 'REFUND_ONLY_FOR_BLACKLIST' },
        { status: 409 }
      );
    }

    const refundFeeLamports = await getRefundFeeLamports();
    const treasuryWallet = process.env.NEXT_PUBLIC_DEST_SOL || '';

    if (!treasuryWallet) {
      return NextResponse.json(
        { success: false, error: 'TREASURY_WALLET_MISSING' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      contribution_id: contributionId,
      wallet_address: wallet,
      mint,
      invalidated_token_amount: row.invalidated_token_amount ?? null,
      refund_status: refundStatus,
      refund_fee_paid: refundFeePaid,
      refund_fee_lamports: refundFeeLamports,
      refund_fee_sol: refundFeeLamports / 1e9,
      treasury_wallet: treasuryWallet,
      note: 'Refund request requires paying the processing fee first.',
    });
  } catch (err) {
    console.error('refund fee prepare failed:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}