//app/api/refunds/fee/prepare/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { PublicKey } from '@solana/web3.js';
import { getRefundFeeLamports } from '@/app/api/_lib/refund-config';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getRefundFeeTreasuryWallet() {
  return (
    process.env.REFUND_TREASURY_SOL ||
    process.env.NEXT_PUBLIC_REFUND_TREASURY_SOL ||
    ''
  ).trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const invalidationId = Number(body?.invalidation_id);
    const wallet = String(body?.wallet_address || '').trim();
    const contributionId = Number(body?.contribution_id);
    const mint = String(body?.mint || '').trim();

    const hasInvalidationId = Number.isFinite(invalidationId) && invalidationId > 0;
    const hasContributionId = Number.isFinite(contributionId) && contributionId > 0;

    if ((!hasInvalidationId && (!wallet || !hasContributionId || !mint))) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    let rows: any[] = [];

    if (hasInvalidationId) {
      rows = (await sql/* sql */`
        SELECT
          id,
          contribution_id,
          wallet_address,
          mint,
          invalidated_token_amount,
          reason,
          refund_status,
          refund_fee_paid,
          refund_fee_lamports,
          refund_fee_tx_signature
        FROM contribution_invalidations
        WHERE id = ${invalidationId}
        LIMIT 1
      `) as any[];
    } else {
      rows = (await sql/* sql */`
        SELECT
          id,
          contribution_id,
          wallet_address,
          mint,
          invalidated_token_amount,
          reason,
          refund_status,
          refund_fee_paid,
          refund_fee_lamports,
          refund_fee_tx_signature
        FROM contribution_invalidations
        WHERE contribution_id = ${contributionId}
          AND wallet_address = ${wallet}
          AND mint = ${mint}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `) as any[];
    }

    const row = rows?.[0];
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'REFUND_NOT_AVAILABLE' },
        { status: 404 }
      );
    }

    const refundStatus = String(row.refund_status || '').trim().toLowerCase();
    const refundFeePaid = Boolean(row.refund_fee_paid);
    const reason = String(row.reason || '').trim().toLowerCase();
    const dbMint = String(row.mint || '').trim();

    if (refundStatus === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REFUNDED' },
        { status: 409 }
      );
    }

    if (!reason.includes('blacklist')) {
      return NextResponse.json(
        { success: false, error: 'REFUND_ONLY_FOR_BLACKLIST' },
        { status: 409 }
      );
    }

    if (refundStatus !== 'requested') {
      return NextResponse.json(
        { success: false, error: 'REFUND_NOT_REQUESTED' },
        { status: 409 }
      );
    }

    if (dbMint.toUpperCase() === 'SOL') {
      return NextResponse.json(
        { success: false, error: 'SOL_REFUND_NOT_SUPPORTED' },
        { status: 409 }
      );
    }

    const refundFeeLamports = await getRefundFeeLamports();
    const treasuryWallet = getRefundFeeTreasuryWallet();

    if (!treasuryWallet) {
      return NextResponse.json(
        { success: false, error: 'TREASURY_WALLET_MISSING' },
        { status: 500 }
      );
    }

    try {
      new PublicKey(treasuryWallet);
    } catch {
      return NextResponse.json(
        { success: false, error: 'TREASURY_WALLET_INVALID' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      invalidation_id: Number(row.id),
      contribution_id: Number(row.contribution_id),
      wallet_address: String(row.wallet_address),
      mint: dbMint,
      invalidated_token_amount: row.invalidated_token_amount ?? null,
      refund_status: refundStatus,
      refund_fee_paid: refundFeePaid,
      refund_fee_lamports: refundFeeLamports,
      refund_fee_sol: refundFeeLamports / 1e9,
      refund_fee_tx_signature: row.refund_fee_tx_signature || null,
      note: 'Refund request requires paying the processing fee first.',
      treasury_wallet: treasuryWallet,
    });
  } catch (err) {
    console.error('refund fee prepare failed:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}