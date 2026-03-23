//app/api/refunds/fee/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { neon } from '@neondatabase/serverless';
import { getRefundFeeLamports } from '@/app/api/_lib/refund-config';
import { isBlacklistRefundReason } from '@/app/api/_lib/refund-reason';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getConnection() {
  const rpc =
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    'https://api.mainnet-beta.solana.com';

  return new Connection(rpc, 'confirmed');
}

function getRefundFeeTreasuryWallet() {
  return (
    process.env.REFUND_TREASURY_SOL ||
    process.env.NEXT_PUBLIC_REFUND_TREASURY_SOL ||
    ''
  ).trim();
}

function normalizePubkeyFromParsed(k: any): string {
  if (typeof k === 'string') return k;
  if (k?.pubkey?.toBase58) return k.pubkey.toBase58();
  return String(k?.pubkey || '');
}

function isSignerKey(k: any): boolean {
  if (typeof k === 'string') return false;
  return Boolean(k?.signer);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getParsedTransactionWithRetry(
  connection: Connection,
  signature: string,
  attempts = 6,
  delayMs = 1500
) {
  for (let i = 0; i < attempts; i++) {
    const parsed = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (parsed) return parsed;

    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const invalidationId = Number(body?.invalidation_id);
    const wallet = String(body?.wallet_address || '').trim();
    const contributionId = Number(body?.contribution_id);
    const mint = String(body?.mint || '').trim();
    const feeTxSignature = String(body?.fee_tx_signature || '').trim();

    const hasInvalidationId = Number.isFinite(invalidationId) && invalidationId > 0;
    const hasContributionId = Number.isFinite(contributionId) && contributionId > 0;

    if ((!hasInvalidationId && (!wallet || !hasContributionId || !mint)) || !feeTxSignature) {
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
    console.log('[REFUND_FEE_CONFIRM] selected row:', {
        rowId: row?.id,
        contributionId: row?.contribution_id,
        wallet: row?.wallet_address,
        mint: row?.mint,
        refundStatus: row?.refund_status,
        refundFeePaid: row?.refund_fee_paid,
        refundFeeTxSignature: row?.refund_fee_tx_signature,
        hasInvalidationId,
        bodyInvalidationId: invalidationId,
        bodyContributionId: contributionId,
        bodyWallet: wallet,
        bodyMint: mint,
    });
    if (!row) {
      return NextResponse.json(
        { success: false, error: 'REFUND_NOT_AVAILABLE' },
        { status: 404 }
      );
    }

    const rowId = Number(row.id);
    const rowContributionId = Number(row.contribution_id);
    const rowWallet = String(row.wallet_address || '').trim();
    const rowMint = String(row.mint || '').trim();
    const reason = String(row.reason || '').trim().toLowerCase();
    const refundStatus = String(row.refund_status || '').trim().toLowerCase();
    if (wallet && wallet !== rowWallet) {
        return NextResponse.json(
          {
            success: false,
            error: 'WALLET_MISMATCH',
            debug_row_wallet: rowWallet,
            debug_body_wallet: wallet,
          },
          { status: 409 }
        );
    }
      
      if (mint && mint !== rowMint) {
        return NextResponse.json(
          {
            success: false,
            error: 'MINT_MISMATCH',
            debug_row_mint: rowMint,
            debug_body_mint: mint,
          },
          { status: 409 }
        );
    }

    if (!isBlacklistRefundReason(reason)) {
      return NextResponse.json(
        {
          success: false,
          error: 'REFUND_ONLY_FOR_BLACKLIST',
          debug_reason: reason || null,
        },
        { status: 409 }
      );
    }

    if (refundStatus === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'ALREADY_REFUNDED' },
        { status: 409 }
      );
    }

    // fee confirm can complete for:
    // - available
    // - requested
    if (refundStatus !== 'available' && refundStatus !== 'requested') {
      return NextResponse.json(
        { success: false, error: 'REFUND_STATUS_NOT_REQUESTABLE' },
        { status: 409 }
      );
    }

    if (rowMint.toUpperCase() === 'SOL') {
      return NextResponse.json(
        { success: false, error: 'SOL_REFUND_NOT_SUPPORTED' },
        { status: 409 }
      );
    }

    if (row.refund_fee_paid && row.refund_fee_tx_signature) {
      return NextResponse.json({
        success: true,
        invalidation_id: rowId,
        contribution_id: rowContributionId,
        refund_fee_paid: true,
        refund_fee_lamports: Number(row.refund_fee_lamports || 0),
        refund_fee_tx_signature: row.refund_fee_tx_signature,
        refund_status: String(row.refund_status || ''),
      });
    }

    const signatureReuse = (await sql/* sql */`
      SELECT id, contribution_id
      FROM contribution_invalidations
      WHERE refund_fee_tx_signature = ${feeTxSignature}
        AND id <> ${rowId}
      LIMIT 1
    `) as any[];

    if (signatureReuse?.length) {
      return NextResponse.json(
        { success: false, error: 'FEE_TX_SIGNATURE_ALREADY_USED' },
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
      new PublicKey(rowWallet);
    } catch {
      return NextResponse.json(
        { success: false, error: 'TREASURY_WALLET_INVALID' },
        { status: 500 }
      );
    }

    const connection = getConnection();
    const parsed = await getParsedTransactionWithRetry(connection, feeTxSignature, 6, 1500);

    if (!parsed) {
        return NextResponse.json(
            {
            success: false,
            error: 'FEE_TX_NOT_FOUND',
            debug_row_id: rowId,
            debug_fee_tx_signature: feeTxSignature,
            },
            { status: 404 }
        );
    }

    if (parsed.meta?.err) {
      return NextResponse.json(
        { success: false, error: 'FEE_TX_FAILED' },
        { status: 409 }
      );
    }

    const keys = parsed.transaction.message.accountKeys || [];
    const signerMatches = keys.some((k: any) => {
      return normalizePubkeyFromParsed(k) === rowWallet && isSignerKey(k);
    });

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
        source === rowWallet &&
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

    const updated = (await sql/* sql */`
      UPDATE contribution_invalidations
      SET
        refund_fee_paid = true,
        refund_fee_lamports = ${refundFeeLamports},
        refund_fee_tx_signature = ${feeTxSignature},
        updated_at = NOW()
      WHERE id = ${rowId}
        AND COALESCE(refund_fee_paid, false) = false
        AND refund_status IN ('available', 'requested')
      RETURNING
        id,
        contribution_id,
        refund_fee_paid,
        refund_fee_lamports,
        refund_fee_tx_signature,
        refund_status
    `) as any[];
    console.log('[REFUND_FEE_CONFIRM] update result:', {
        rowId,
        updatedCount: updated?.length || 0,
        updated,
    });

    if (updated?.length) {
      const saved = updated[0];
      return NextResponse.json({
        success: true,
        invalidation_id: Number(saved.id),
        contribution_id: Number(saved.contribution_id),
        refund_fee_paid: Boolean(saved.refund_fee_paid),
        refund_fee_lamports: Number(saved.refund_fee_lamports || 0),
        refund_fee_tx_signature: String(saved.refund_fee_tx_signature || ''),
        refund_status: String(saved.refund_status || ''),
        debug_refund_status_before: refundStatus,
        debug_row_wallet: rowWallet,
        debug_row_mint: rowMint,
      });
    }

    // Re-read the row instead of blindly returning success.
    const reread = (await sql/* sql */`
      SELECT
        id,
        contribution_id,
        refund_fee_paid,
        refund_fee_lamports,
        refund_fee_tx_signature,
        refund_status
      FROM contribution_invalidations
      WHERE id = ${rowId}
      LIMIT 1
    `) as any[];

    const after = reread?.[0];
    console.log('[REFUND_FEE_CONFIRM] reread row:', after);

    if (after?.refund_fee_paid && after?.refund_fee_tx_signature) {
      return NextResponse.json({
        success: true,
        invalidation_id: Number(after.id),
        contribution_id: Number(after.contribution_id),
        refund_fee_paid: true,
        refund_fee_lamports: Number(after.refund_fee_lamports || 0),
        refund_fee_tx_signature: String(after.refund_fee_tx_signature || ''),
        refund_status: String(after.refund_status || ''),
        debug_refund_status_before: refundStatus,
        debug_row_wallet: rowWallet,
        debug_row_mint: rowMint,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'REFUND_FEE_DB_UPDATE_FAILED',
        debug_refund_status_before: refundStatus,
        debug_row_id: rowId,
        debug_row_wallet: rowWallet,
        debug_row_mint: rowMint,
      },
      { status: 409 }
    );
  } catch (err) {
    console.error('refund fee confirm failed:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}