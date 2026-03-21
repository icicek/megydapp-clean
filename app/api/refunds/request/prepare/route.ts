//app/api/refunds/request/prepare/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function randomNonce(size = 24) {
  return crypto.randomBytes(size).toString('hex');
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

    if (!hasInvalidationId && (!wallet || !hasContributionId || !mint)) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    let found: any[] = [];

    if (hasInvalidationId) {
      found = (await sql/* sql */`
        SELECT
          id,
          refund_status,
          wallet_address,
          contribution_id,
          mint
        FROM contribution_invalidations
        WHERE id = ${invalidationId}
        LIMIT 1
      `) as any[];
    } else {
      found = (await sql/* sql */`
        SELECT
          id,
          refund_status,
          wallet_address,
          contribution_id,
          mint
        FROM contribution_invalidations
        WHERE contribution_id = ${contributionId}
          AND wallet_address = ${wallet}
          AND mint = ${mint}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `) as any[];
    }

    const row = found?.[0];
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'REFUND_NOT_AVAILABLE' },
        { status: 404 }
      );
    }

    const resolvedWallet = String(row.wallet_address || '').trim();
    const resolvedContributionId = Number(row.contribution_id);
    const resolvedMint = String(row.mint || '').trim();
    const current = String(row.refund_status || '').trim().toLowerCase();

    if (current === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REFUNDED' },
        { status: 409 }
      );
    }

    if (current !== 'available' && current !== 'requested') {
      return NextResponse.json(
        { success: false, error: 'REFUND_STATUS_NOT_REQUESTABLE' },
        { status: 409 }
      );
    }

    // requested ise yine de yeni challenge üretebiliriz;
    // final route idempotent davranacak.
    const nonce = randomNonce(16);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const message = [
      'Coincarnation Refund Request',
      `Invalidation ID: ${row.id}`,
      `Wallet: ${resolvedWallet}`,
      `Contribution ID: ${resolvedContributionId}`,
      `Mint: ${resolvedMint}`,
      `Nonce: ${nonce}`,
      `Expires At: ${expiresAt.toISOString()}`,
    ].join('\n');

    await sql/* sql */`
      INSERT INTO refund_request_challenges (
        wallet_address,
        contribution_id,
        mint,
        nonce,
        message,
        expires_at,
        created_at
      )
      VALUES (
        ${resolvedWallet},
        ${resolvedContributionId},
        ${resolvedMint},
        ${nonce},
        ${message},
        ${expiresAt.toISOString()}::timestamp,
        NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      invalidation_id: Number(row.id),
      wallet_address: resolvedWallet,
      contribution_id: resolvedContributionId,
      mint: resolvedMint,
      nonce,
      message,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('refund prepare failed:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}