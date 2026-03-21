//app/api/refunds/request/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { isBlacklistRefundReason } from '@/app/api/_lib/refund-reason';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifySignature(message: string, walletAddress: string, signatureBase64: string) {
  try {
    const publicKey = bs58.decode(walletAddress);
    const signature = Buffer.from(signatureBase64, 'base64');
    const messageBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const invalidationId = Number(body?.invalidation_id);
    const wallet = String(body?.wallet_address || '').trim();
    const contributionId = Number(body?.contribution_id);
    const mint = String(body?.mint || '').trim();
    const nonce = String(body?.nonce || '').trim();
    const signatureBase64 = String(body?.signature_base64 || '').trim();

    const hasInvalidationId = Number.isFinite(invalidationId) && invalidationId > 0;
    const hasContributionId = Number.isFinite(contributionId) && contributionId > 0;

    if (
      ((!hasInvalidationId && (!wallet || !hasContributionId || !mint)) || !nonce || !signatureBase64)
    ) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    // Challenge lookup
    const challengeRows = (await sql/* sql */`
      SELECT
        id,
        message,
        expires_at,
        used_at
      FROM refund_request_challenges
      WHERE wallet_address = ${wallet}
        AND contribution_id = ${contributionId}
        AND mint = ${mint}
        AND nonce = ${nonce}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `) as any[];

    const challenge = challengeRows?.[0];
    if (!challenge) {
      return NextResponse.json(
        { success: false, error: 'CHALLENGE_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (challenge.used_at) {
      return NextResponse.json(
        { success: false, error: 'CHALLENGE_ALREADY_USED' },
        { status: 409 }
      );
    }

    const expiresAt = new Date(challenge.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'CHALLENGE_EXPIRED' },
        { status: 409 }
      );
    }

    const signatureOk = verifySignature(String(challenge.message || ''), wallet, signatureBase64);
    if (!signatureOk) {
      return NextResponse.json(
        { success: false, error: 'INVALID_SIGNATURE' },
        { status: 401 }
      );
    }

    let found: any[] = [];

    if (hasInvalidationId) {
      found = (await sql/* sql */`
        SELECT
          id,
          refund_status,
          refund_fee_paid,
          reason,
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
          refund_fee_paid,
          reason,
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

    const rowId = Number(row.id);
    const rowWallet = String(row.wallet_address || '').trim();
    const rowContributionId = Number(row.contribution_id);
    const rowMint = String(row.mint || '').trim();
    const current = String(row.refund_status || '').trim().toLowerCase();
    const reason = String(row.reason || '').trim().toLowerCase();

    if (wallet && wallet !== rowWallet) {
      return NextResponse.json(
        { success: false, error: 'WALLET_MISMATCH' },
        { status: 409 }
      );
    }

    if (mint && mint !== rowMint) {
      return NextResponse.json(
        { success: false, error: 'MINT_MISMATCH' },
        { status: 409 }
      );
    }

    if (!isBlacklistRefundReason(reason)) {
      return NextResponse.json(
        { success: false, error: 'REFUND_ONLY_FOR_BLACKLIST' },
        { status: 409 }
      );
    }

    if (current === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REFUNDED' },
        { status: 409 }
      );
    }

    if (!row.refund_fee_paid) {
      return NextResponse.json(
        { success: false, error: 'REFUND_FEE_NOT_PAID' },
        { status: 409 }
      );
    }

    if (current !== 'available' && current !== 'requested') {
      return NextResponse.json(
        { success: false, error: 'REFUND_STATUS_NOT_REQUESTABLE' },
        { status: 409 }
      );
    }

    if (current === 'available') {
      await sql/* sql */`
        UPDATE contribution_invalidations
        SET
          refund_status = 'requested',
          requested_at = COALESCE(requested_at, NOW()),
          updated_at = NOW()
        WHERE id = ${rowId}
          AND refund_status = 'available'
      `;
    }

    await sql/* sql */`
      UPDATE refund_request_challenges
      SET used_at = NOW()
      WHERE id = ${challenge.id}
        AND used_at IS NULL
    `;

    return NextResponse.json({
      success: true,
      invalidation_id: rowId,
      contribution_id: rowContributionId,
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