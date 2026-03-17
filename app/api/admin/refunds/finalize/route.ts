//app/api/admin/refunds/finalize/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import { neon } from '@neondatabase/serverless';
import { requireAdmin, HttpError } from '@/app/api/_lib/jwt';

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

function getRefundTreasuryWallet() {
  return (
    process.env.REFUND_TREASURY_SOL ||
    process.env.NEXT_PUBLIC_REFUND_TREASURY_SOL ||
    ''
  ).trim();
}

function toRawAmount(ui: string | number, decimals: number): bigint {
  const s = String(ui ?? '0').replace(/[^0-9.]/g, '');
  const [i = '0', f = ''] = s.split('.');
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  const joined = `${i}${frac}`.replace(/^0+/, '');
  return BigInt(joined.length ? joined : '0');
}

function uiToLamportsBigInt(ui: string | number): bigint {
  const s = String(ui ?? '0').trim();
  const [i = '0', f = ''] = s.split('.');
  const frac = (f + '0'.repeat(9)).slice(0, 9);
  const joined = `${i}${frac}`.replace(/^0+/, '');
  return BigInt(joined.length ? joined : '0');
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

export async function POST(req: NextRequest) {
  try {
    const adminWallet = await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const contributionId = Number(body?.contribution_id);
    const refundTxSignature = String(body?.refund_tx_signature || '').trim();
    const executedBy = String(body?.executed_by || '').trim();

    if (!Number.isFinite(contributionId) || contributionId <= 0 || !refundTxSignature || !executedBy) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    if (adminWallet !== executedBy) {
      return NextResponse.json(
        { success: false, error: 'REFUND_TX_EXECUTOR_MISMATCH' },
        { status: 409 }
      );
    }

    const refundTreasury = getRefundTreasuryWallet();
    if (!refundTreasury) {
      return NextResponse.json(
        { success: false, error: 'TREASURY_WALLET_MISSING' },
        { status: 500 }
      );
    }

    try {
      new PublicKey(refundTreasury);
    } catch {
      return NextResponse.json(
        { success: false, error: 'TREASURY_WALLET_INVALID' },
        { status: 500 }
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
      ORDER BY ci.created_at DESC, ci.id DESC
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

    if (!refundFeePaid) {
      return NextResponse.json(
        { success: false, error: 'REFUND_FEE_NOT_PAID' },
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

    const connection = getConnection();

    const parsed = await connection.getParsedTransaction(refundTxSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'REFUND_TX_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (parsed.meta?.err) {
      return NextResponse.json(
        { success: false, error: 'REFUND_TX_FAILED' },
        { status: 409 }
      );
    }

    const keys = parsed.transaction.message.accountKeys || [];

    const signerMatch = keys.some((k: any) => {
      return normalizePubkeyFromParsed(k) === executedBy && isSignerKey(k);
    });

    if (!signerMatch) {
      return NextResponse.json(
        { success: false, error: 'REFUND_TX_EXECUTOR_MISMATCH' },
        { status: 409 }
      );
    }

    if (executedBy !== refundTreasury) {
      return NextResponse.json(
        { success: false, error: 'REFUND_TX_TREASURY_MISMATCH' },
        { status: 409 }
      );
    }

    const mint = String(row.mint);
    const destinationWallet = String(row.wallet_address);
    const uiAmount = row.invalidated_token_amount;

    let transferOk = false;

    if (mint === 'SOL') {
      const lamportsExpected = uiToLamportsBigInt(uiAmount);
      const instructions = parsed.transaction.message.instructions || [];

      for (const ix of instructions as any[]) {
        if (ix.program !== 'system') continue;
        if (ix.parsed?.type !== 'transfer') continue;

        const info = ix.parsed?.info;
        if (!info) continue;

        const source = String(info.source || '');
        const destination = String(info.destination || '');
        const lamports = BigInt(String(info.lamports || 0));

        if (
          source === refundTreasury &&
          destination === destinationWallet &&
          lamports >= lamportsExpected
        ) {
          transferOk = true;
          break;
        }
      }
    } else {
      let mintPk: PublicKey;
      let destinationPk: PublicKey;
      let treasuryPk: PublicKey;

      try {
        mintPk = new PublicKey(mint);
        destinationPk = new PublicKey(destinationWallet);
        treasuryPk = new PublicKey(refundTreasury);
      } catch {
        return NextResponse.json(
          { success: false, error: 'REFUND_TX_NOT_VALID' },
          { status: 409 }
        );
      }

      const mintAcc = await connection.getAccountInfo(mintPk, 'confirmed');
      if (!mintAcc) {
        return NextResponse.json(
          { success: false, error: 'MINT_NOT_FOUND' },
          { status: 404 }
        );
      }

      const is2022 = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID);
      const program = is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      const mintInfo = await getMint(connection, mintPk, 'confirmed', program);
      const decimals = mintInfo.decimals ?? 0;
      const expectedRaw = toRawAmount(uiAmount, decimals);

      const sourceAta = getAssociatedTokenAddressSync(
        mintPk,
        treasuryPk,
        false,
        program
      ).toBase58();

      const destAta = getAssociatedTokenAddressSync(
        mintPk,
        destinationPk,
        false,
        program
      ).toBase58();

      const instructions = parsed.transaction.message.instructions || [];

      for (const ix of instructions as any[]) {
        const programName = String(ix.program || '').toLowerCase();
        if (programName !== 'spl-token' && programName !== 'spl-token-2022') continue;

        const parsedIx = ix.parsed;
        if (!parsedIx) continue;

        const ixType = String(parsedIx.type || '').toLowerCase();
        if (ixType !== 'transfer' && ixType !== 'transferchecked') continue;

        const info = parsedIx.info || {};
        const source = String(info.source || '');
        const destination = String(info.destination || '');
        const authority = String(info.authority || info.owner || '');
        const rawAmount =
          info.tokenAmount?.amount != null
            ? BigInt(String(info.tokenAmount.amount))
            : info.amount != null
            ? BigInt(String(info.amount))
            : 0n;

        if (
          source === sourceAta &&
          destination === destAta &&
          authority === refundTreasury &&
          rawAmount >= expectedRaw
        ) {
          transferOk = true;
          break;
        }
      }
    }

    if (!transferOk) {
      return NextResponse.json(
        { success: false, error: 'REFUND_TX_NOT_VALID' },
        { status: 409 }
      );
    }

    const updated = (await sql/* sql */`
      UPDATE contribution_invalidations
      SET
        refund_status = 'refunded',
        refunded_at = NOW(),
        refund_tx_signature = ${refundTxSignature},
        executed_by = ${executedBy},
        updated_at = NOW()
      WHERE id = ${row.id}
        AND refund_status = 'requested'
        AND refund_fee_paid = true
      RETURNING id
    `) as any[];

    if (!updated?.length) {
      return NextResponse.json(
        { success: false, error: 'REFUND_FINALIZE_RACE_LOST' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      contribution_id: contributionId,
      refund_status: 'refunded',
      refund_tx_signature: refundTxSignature,
    });
  } catch (err: any) {
    console.error('admin refund finalize failed:', err);

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