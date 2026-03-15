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
    const wallet = String(body?.wallet_address || '').trim();
    const contributionId = Number(body?.contribution_id);
    const mint = String(body?.mint || '').trim();

    if (!wallet || !Number.isFinite(contributionId) || contributionId <= 0 || !mint) {
      return NextResponse.json({ success: false, error: 'BAD_REQUEST' }, { status: 400 });
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
      return NextResponse.json({ success: false, error: 'REFUND_NOT_AVAILABLE' }, { status: 404 });
    }

    const current = String(row.refund_status || '');
    if (current === 'refunded') {
      return NextResponse.json({ success: false, error: 'ALREADY_REFUNDED' }, { status: 409 });
    }

    // requested ise yine de yeni challenge üretebiliriz; son route tekrar idempotent davranacak
    const nonce = randomNonce(16);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 dakika

    const message = [
      'Coincarnation Refund Request',
      `Wallet: ${wallet}`,
      `Contribution ID: ${contributionId}`,
      `Mint: ${mint}`,
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
        ${wallet},
        ${contributionId},
        ${mint},
        ${nonce},
        ${message},
        ${expiresAt.toISOString()}::timestamp,
        NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      wallet_address: wallet,
      contribution_id: contributionId,
      mint,
      nonce,
      message,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('refund prepare failed:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}