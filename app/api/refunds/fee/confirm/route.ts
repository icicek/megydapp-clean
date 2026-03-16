//app/api/refunds/fee/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { neon } from '@neondatabase/serverless';
import { getRefundFeeLamports } from '@/app/api/_lib/refund-config';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getConnection() {
  const rpc =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    'https://api.mainnet-beta.solana.com';

  return new Connection(rpc, 'confirmed');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const wallet = String(body?.wallet_address || '').trim();
    const contributionId = Number(body?.contribution_id);
    const mint = String(body?.mint || '').trim();
    const feeTxSignature = String(body?.fee_tx_signature || '').trim();

    if (!wallet || !Number.isFinite(contributionId) || contributionId <= 0 || !mint || !feeTxSignature) {
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
        reason,
        refund_status,
        refund_fee_paid,
        refund_fee_tx_signature
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

    const reason = String(row.reason || '');

    if (reason.toLowerCase() !== 'blacklist') {
      return NextResponse.json(
        { success: false, error: 'REFUND_ONLY_FOR_BLACKLIST' },
        { status: 409 }
      );
    }

    if (String(row.refund_status || '') === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REFUNDED' },
        { status: 409 }
      );
    }

    if (row.refund_fee_paid && row.refund_fee_tx_signature) {
      return NextResponse.json({
        success: true,
        contribution_id: contributionId,
        refund_fee_paid: true,
        refund_fee_tx_signature: row.refund_fee_tx_signature,
      });
    }

    const refundFeeLamports = await getRefundFeeLamports();
    const treasuryWallet = process.env.NEXT_PUBLIC_DEST_SOL || '';

    if (!treasuryWallet) {
      return NextResponse.json(
        { success: false, error: 'TREASURY_WALLET_MISSING' },
        { status: 500 }
      );
    }

    const connection = getConnection();
    const parsed = await connection.getParsedTransaction(feeTxSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'FEE_TX_NOT_FOUND' },
        { status: 404 }
      );
    }

    const accountKeys = parsed.transaction.message.accountKeys.map((k: any) =>
      typeof k === 'string' ? k : k.pubkey?.toBase58?.() || String(k.pubkey)
    );

    const signerMatches = accountKeys.includes(wallet);
    if (!signerMatches) {
      return NextResponse.json(
        { success: false, error: 'FEE_TX_WALLET_MISMATCH' },
        { status: 409 }
      );
    }

    let transferOk = false;
    const instructions = parsed.transaction.message.instructions || [];

    for (const ix of instructions as any[]) {
      if (ix.program !== 'system') continue;
      if (ix.parsed?.type !== 'transfer') continue;

      const info = ix.parsed?.info;
      if (!info) continue;

      const source = String(info.source || '');
      const destination = String(info.destination || '');
      const lamports = Number(info.lamports || 0);

      if (
        source === wallet &&
        destination === treasuryWallet &&
        lamports >= refundFeeLamports
      ) {
        transferOk = true;
        break;
      }
    }

    if (!transferOk) {
      return NextResponse.json(
        { success: false, error: 'REFUND_FEE_PAYMENT_NOT_VALID' },
        { status: 409 }
      );
    }

    await sql/* sql */`
      UPDATE contribution_invalidations
      SET
        refund_fee_paid = true,
        refund_fee_lamports = ${refundFeeLamports},
        refund_fee_tx_signature = ${feeTxSignature},
        updated_at = NOW()
      WHERE contribution_id = ${contributionId}
        AND wallet_address = ${wallet}
        AND mint = ${mint}
    `;

    return NextResponse.json({
      success: true,
      contribution_id: contributionId,
      refund_fee_paid: true,
      refund_fee_lamports: refundFeeLamports,
      refund_fee_tx_signature: feeTxSignature,
    });
  } catch (err) {
    console.error('refund fee confirm failed:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}