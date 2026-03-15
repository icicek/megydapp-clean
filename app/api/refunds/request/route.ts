//app/api/refunds/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifySolanaMessageSignature(args: {
  wallet: string;
  message: string;
  signatureBase64?: string;
  signatureBase58?: string;
}) {
  const { wallet, message, signatureBase64, signatureBase58 } = args;

  const publicKeyBytes = bs58.decode(wallet);
  const messageBytes = new TextEncoder().encode(message);

  let signatureBytes: Uint8Array;
  if (signatureBase64) {
    signatureBytes = Uint8Array.from(Buffer.from(signatureBase64, 'base64'));
  } else if (signatureBase58) {
    signatureBytes = bs58.decode(signatureBase58);
  } else {
    return false;
  }

  return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const wallet = String(body?.wallet_address || '').trim();
    const contributionId = Number(body?.contribution_id);
    const mint = String(body?.mint || '').trim();
    const nonce = String(body?.nonce || '').trim();
    const signatureBase64 = body?.signature_base64 ? String(body.signature_base64) : undefined;
    const signatureBase58 = body?.signature_base58 ? String(body.signature_base58) : undefined;

    if (!wallet || !Number.isFinite(contributionId) || contributionId <= 0 || !mint || !nonce) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const challengeRows = (await sql/* sql */`
      SELECT id, message, expires_at, used_at
      FROM refund_request_challenges
      WHERE wallet_address = ${wallet}
        AND contribution_id = ${contributionId}
        AND mint = ${mint}
        AND nonce = ${nonce}
      ORDER BY created_at DESC
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

    const ok = verifySolanaMessageSignature({
      wallet,
      message: String(challenge.message),
      signatureBase64,
      signatureBase58,
    });

    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'INVALID_SIGNATURE' },
        { status: 401 }
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

    if (current !== 'requested') {
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
    }

    await sql/* sql */`
      UPDATE refund_request_challenges
      SET
        used_at = NOW()
      WHERE id = ${challenge.id}
        AND used_at IS NULL
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