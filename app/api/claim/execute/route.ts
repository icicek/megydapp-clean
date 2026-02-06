// app/api/claim/execute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';

const sql = neon(process.env.DATABASE_URL!);

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

function json(status: number, data: any) {
  return NextResponse.json(data, { status });
}

function asNum(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Accepts MEGY_TREASURY_SECRET_KEY as either:
// - JSON array string: "[12,34,...]"
// - base64 string
function loadKeypair(): Keypair {
  const raw = String(process.env.MEGY_TREASURY_SECRET_KEY || '').trim();
  if (!raw) throw new Error('MISSING_TREASURY_SECRET');

  // JSON array
  if (raw.startsWith('[')) {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  // base64
  const buf = Buffer.from(raw, 'base64');
  return Keypair.fromSecretKey(new Uint8Array(buf));
}

type Body = {
  session_id: string;
  wallet_address: string;
  destination: string;
  phase_id: number;
  claim_amount: number;
};

export async function POST(req: NextRequest) {
  let body: Body | null = null;
  try {
    body = (await req.json().catch(() => null)) as Body | null;
  } catch {
    body = null;
  }
  if (!body) return json(400, { success: false, error: 'BAD_JSON' });

  const sessionId = String(body.session_id || '').trim();
  const wallet = String(body.wallet_address || '').trim();
  const destination = String(body.destination || '').trim();
  const phaseId = asNum(body.phase_id);
  const amount = asNum(body.claim_amount);

  if (!sessionId || !wallet || !destination) {
    return json(400, { success: false, error: 'MISSING_FIELDS' });
  }
  if (!Number.isFinite(phaseId) || phaseId <= 0) {
    return json(400, { success: false, error: 'BAD_PHASE_ID' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return json(400, { success: false, error: 'BAD_AMOUNT' });
  }

  let walletPk: PublicKey;
  let destPk: PublicKey;
  try {
    walletPk = new PublicKey(wallet);
    destPk = new PublicKey(destination);
  } catch {
    return json(400, { success: false, error: 'INVALID_PUBKEY' });
  }

  const MEGY_MINT = String(process.env.MEGY_MINT || '').trim();
  if (!MEGY_MINT) return json(500, { success: false, error: 'MISSING_MEGY_MINT' });

  const mintPk = new PublicKey(MEGY_MINT);

  // --- DB validation + claimable check ---
  await sql`BEGIN`;
  try {
    const s = await sql`
      SELECT id, wallet_address, destination, status
      FROM claim_sessions
      WHERE id = ${sessionId}
      LIMIT 1
      FOR UPDATE
    `;

    if (!s?.length) {
      await sql`ROLLBACK`;
      return json(404, { success: false, error: 'SESSION_NOT_FOUND' });
    }

    if (String(s[0].wallet_address) !== wallet) {
      await sql`ROLLBACK`;
      return json(403, { success: false, error: 'SESSION_WALLET_MISMATCH' });
    }

    if (String(s[0].status) !== 'open') {
      await sql`ROLLBACK`;
      return json(409, { success: false, error: 'SESSION_NOT_OPEN' });
    }

    // destination mismatch? allowed, because you asked: destination may change but same session
    // (optional) update destination to latest
    if (String(s[0].destination) !== destination) {
      await sql`
        UPDATE claim_sessions SET destination = ${destination}
        WHERE id = ${sessionId}
      `;
    }

    const rows = await sql`
      WITH snap AS (
        SELECT COALESCE(SUM(megy_amount), 0) AS snap_amount
        FROM claim_snapshots
        WHERE wallet_address = ${wallet} AND phase_id = ${phaseId}
      ),
      cl AS (
        SELECT COALESCE(SUM(claim_amount), 0) AS claimed_amount
        FROM claims
        WHERE wallet_address = ${wallet} AND phase_id = ${phaseId}
      )
      SELECT
        (SELECT snap_amount FROM snap) AS snap_amount,
        (SELECT claimed_amount FROM cl) AS claimed_amount
    `;

    const snap = asNum(rows?.[0]?.snap_amount);
    const claimed = asNum(rows?.[0]?.claimed_amount);
    const claimable = Math.max(0, snap - claimed);

    if (amount > claimable) {
      await sql`ROLLBACK`;
      return json(409, {
        success: false,
        error: 'AMOUNT_EXCEEDS_PHASE_CLAIMABLE',
        want: amount,
        can: claimable,
        phase_id: phaseId,
      });
    }

    // ✅ At this point, DB checks OK.
    // We'll COMMIT after on-chain transfer + claim insert.
    // (We keep transaction open to prevent concurrent double-claim.)
  } catch (e) {
    try { await sql`ROLLBACK`; } catch {}
    console.error('execute precheck failed:', e);
    return json(500, { success: false, error: 'DB_PRECHECK_FAILED' });
  }

  // --- On-chain transfer (server signs) ---
  try {
    const conn = new Connection(RPC_URL, 'confirmed');
    const treasurySigner = loadKeypair();
    const treasuryOwner = treasurySigner.publicKey;

    const fromAta = await getAssociatedTokenAddress(mintPk, treasuryOwner, false);
    const toAta = await getAssociatedTokenAddress(mintPk, destPk, false);

    const ix: any[] = [];

    // Create destination ATA if missing
    const toInfo = await conn.getAccountInfo(toAta, 'confirmed');
    if (!toInfo) {
      ix.push(
        createAssociatedTokenAccountInstruction(
          treasuryOwner, // payer
          toAta,
          destPk,
          mintPk
        )
      );
    }

    // IMPORTANT: amount is MEGY base units? (decimals)
    // If claim_amount is already in "whole MEGY", you must convert using decimals.
    // For now we assume claim_amount is already in base units OR MEGY has 0 decimals.
    // If MEGY has decimals, tell me the decimals and I’ll patch conversion.
    ix.push(
      createTransferInstruction(
        fromAta,
        toAta,
        treasuryOwner,
        BigInt(Math.floor(amount))
      )
    );

    const tx = new Transaction().add(...ix);
    tx.feePayer = treasuryOwner;

    const latest = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;

    tx.sign(treasurySigner);

    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed',
    });

    const conf = await conn.confirmTransaction(
      {
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      'confirmed'
    );

    if (conf?.value?.err) {
      throw new Error('CLAIM_TX_FAILED');
    }

    // --- Insert claim row + close session if fully claimed ---
    try {
      // tx_signature reuse guard is already in DB indexes (unique)
      const ins = await sql`
        INSERT INTO claims (
          phase_id,
          wallet_address,
          claim_amount,
          destination,
          tx_signature,
          session_id,
          sol_fee_paid,
          sol_fee_amount,
          timestamp
        )
        VALUES (
          ${phaseId},
          ${wallet},
          ${amount},
          ${destination},
          ${sig},
          ${sessionId},
          ${true},
          ${0},
          now()
        )
        RETURNING id
      `;

      if (!ins?.length) {
        throw new Error('CLAIM_INSERT_FAILED');
      }

      await sql`
        UPDATE claim_sessions
        SET total_claimed_in_session = COALESCE(total_claimed_in_session, 0) + ${amount}
        WHERE id = ${sessionId}
      `;

      const totals = await sql`
        WITH snaps AS (
          SELECT COALESCE(SUM(megy_amount), 0) AS snap_sum
          FROM claim_snapshots
          WHERE wallet_address = ${wallet}
        ),
        cls AS (
          SELECT COALESCE(SUM(claim_amount), 0) AS claimed_sum
          FROM claims
          WHERE wallet_address = ${wallet}
        )
        SELECT
          (SELECT snap_sum FROM snaps) AS snap_sum,
          (SELECT claimed_sum FROM cls) AS claimed_sum
      `;

      const snapSum = asNum(totals?.[0]?.snap_sum);
      const claimedSum = asNum(totals?.[0]?.claimed_sum);
      const totalClaimable = Math.max(0, snapSum - claimedSum);

      let closed = false;
      if (totalClaimable <= 0) {
        await sql`
          UPDATE claim_sessions
          SET status = 'closed', closed_at = now()
          WHERE id = ${sessionId} AND status = 'open'
        `;
        closed = true;
      }

      await sql`COMMIT`;

      return json(200, {
        success: true,
        tx_signature: sig,
        session_closed: closed,
        total_claimable_remaining: totalClaimable,
      });
    } catch (e) {
      try { await sql`ROLLBACK`; } catch {}
      console.error('DB insert after transfer failed:', e);
      // ⚠️ Worst-case: tx sent but DB failed. Needs reconciliation.
      return json(500, {
        success: false,
        error: 'DB_RECORD_FAILED_AFTER_TRANSFER',
        tx_signature: sig,
      });
    }
  } catch (e: any) {
    try { await sql`ROLLBACK`; } catch {}
    console.error('execute failed:', e);
    return json(500, { success: false, error: String(e?.message || 'EXECUTE_FAILED') });
  }
}
