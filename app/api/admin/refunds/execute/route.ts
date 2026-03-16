//app/api/admin/refunds/execute/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const contributionId = Number(body?.contribution_id);

    if (!Number.isFinite(contributionId) || contributionId <= 0) {
      return NextResponse.json(
        { success: false, error: 'BAD_CONTRIBUTION_ID' },
        { status: 400 }
      );
    }

    const rows = (await sql/* sql */`
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
      ORDER BY ci.created_at DESC
      LIMIT 1
    `) as any[];

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

    const treasuryWallet = process.env.NEXT_PUBLIC_DEST_SOL || '';
    if (!treasuryWallet) {
      return NextResponse.json(
        { success: false, error: 'TREASURY_WALLET_MISSING' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      refund: {
        contribution_id: Number(row.contribution_id),
        wallet_address: String(row.wallet_address),
        mint: String(row.mint),
        token_symbol: row.token_symbol ? String(row.token_symbol) : null,
        invalidated_token_amount: row.invalidated_token_amount,
        treasury_wallet: treasuryWallet,
        network: 'solana',
      },
    });
  } catch (err) {
    console.error('admin refund execute prepare failed:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}