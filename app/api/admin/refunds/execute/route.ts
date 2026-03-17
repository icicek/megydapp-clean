//app/api/admin/refunds/execute/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { PublicKey } from '@solana/web3.js';
import { requireAdmin, HttpError } from '@/app/api/_lib/jwt';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getCoincarnationTreasuryWallet() {
  return (
    process.env.COINCARNE_TREASURY_SOL ||
    process.env.DEST_SOLANA ||
    process.env.NEXT_PUBLIC_DEST_SOL ||
    ''
  ).trim();
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));

    const invalidationId = Number(body?.invalidation_id);
    const contributionId = Number(body?.contribution_id);

    const hasInvalidationId = Number.isFinite(invalidationId) && invalidationId > 0;
    const hasContributionId = Number.isFinite(contributionId) && contributionId > 0;

    if (!hasInvalidationId && !hasContributionId) {
      return NextResponse.json(
        { success: false, error: 'BAD_CONTRIBUTION_ID' },
        { status: 400 }
      );
    }

    let rows: any[] = [];

    if (hasInvalidationId) {
      rows = (await sql/* sql */`
        SELECT
          ci.id,
          ci.contribution_id,
          ci.wallet_address,
          ci.mint,
          ci.invalidated_token_amount,
          ci.reason,
          ci.refund_status,
          ci.refund_fee_paid,
          c.token_symbol,
          c.network
        FROM contribution_invalidations ci
        LEFT JOIN contributions c
          ON c.id = ci.contribution_id
        WHERE ci.id = ${invalidationId}
        LIMIT 1
      `) as any[];
    } else {
      rows = (await sql/* sql */`
        SELECT
          ci.id,
          ci.contribution_id,
          ci.wallet_address,
          ci.mint,
          ci.invalidated_token_amount,
          ci.reason,
          ci.refund_status,
          ci.refund_fee_paid,
          c.token_symbol,
          c.network
        FROM contribution_invalidations ci
        LEFT JOIN contributions c
          ON c.id = ci.contribution_id
        WHERE ci.contribution_id = ${contributionId}
        ORDER BY ci.created_at DESC, ci.id DESC
        LIMIT 1
      `) as any[];
    }

    const row = rows?.[0];
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'REFUND_NOT_FOUND' },
        { status: 404 }
      );
    }

    const reason = String(row.reason || '').trim().toLowerCase();
    const refundStatus = String(row.refund_status || '').trim().toLowerCase();
    const refundFeePaid = Boolean(row.refund_fee_paid);
    const network = String(row.network || '').trim().toLowerCase();
    const mint = String(row.mint || '').trim();

    if (!reason.includes('blacklist')) {
      return NextResponse.json(
        { success: false, error: 'REFUND_ONLY_FOR_BLACKLIST' },
        { status: 409 }
      );
    }

    if (network !== 'solana') {
      return NextResponse.json(
        { success: false, error: 'UNSUPPORTED_REFUND_NETWORK' },
        { status: 409 }
      );
    }

    if (mint.toUpperCase() === 'SOL') {
      return NextResponse.json(
        { success: false, error: 'SOL_REFUND_NOT_SUPPORTED' },
        { status: 409 }
      );
    }

    if (refundStatus === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REFUNDED' },
        { status: 409 }
      );
    }

    if (refundStatus !== 'requested') {
      return NextResponse.json(
        { success: false, error: 'REFUND_NOT_REQUESTED' },
        { status: 409 }
      );
    }

    if (!refundFeePaid) {
      return NextResponse.json(
        { success: false, error: 'REFUND_FEE_NOT_PAID' },
        { status: 409 }
      );
    }

    const treasuryWallet = getCoincarnationTreasuryWallet();
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

    try {
      new PublicKey(String(row.wallet_address));
    } catch {
      return NextResponse.json(
        { success: false, error: 'INVALID_DESTINATION_WALLET' },
        { status: 409 }
      );
    }

    try {
      new PublicKey(mint);
    } catch {
      return NextResponse.json(
        { success: false, error: 'INVALID_MINT_ADDRESS' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      refund: {
        invalidation_id: Number(row.id),
        contribution_id: Number(row.contribution_id),
        wallet_address: String(row.wallet_address),
        mint,
        token_symbol: row.token_symbol ? String(row.token_symbol) : null,
        invalidated_token_amount: row.invalidated_token_amount,
        treasury_wallet: treasuryWallet,
        network: 'solana',
      },
    });
  } catch (err: any) {
    console.error('admin refund execute prepare failed:', err);

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