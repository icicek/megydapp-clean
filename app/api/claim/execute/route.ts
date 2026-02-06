// app/api/claim/execute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
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

function asStr(v: any) {
  return String(v ?? '').trim();
}

// Accepts MEGY_TREASURY_SECRET_KEY as either:
// - JSON array string: "[12,34,...]"
// - base64 string
function loadKeypair(): Keypair {
  const raw = String(process.env.MEGY_TREASURY_SECRET_KEY || '').trim();
  if (!raw) throw new Error('MISSING_TREASURY_SECRET');

  if (raw.startsWith('[')) {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  const buf = Buffer.from(raw, 'base64');
  return Keypair.fromSecretKey(new Uint8Array(buf));
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Parse human amount (string/number) into base units bigint with decimals.
 * - supports integer strings ("123")
 * - supports decimal strings ("1.25") up to `decimals`
 */
function toBaseUnits(amountLike: string | number, decimals: number): bigint {
  const raw = String(amountLike ?? '').trim();
  if (!raw) throw new Error('BAD_AMOUNT');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('BAD_AMOUNT_FORMAT');

  const [iPart, fPartRaw = ''] = raw.split('.');
  const fPart = fPartRaw.slice(0, decimals);
  const paddedFrac = fPart.padEnd(decimals, '0');
  const full = `${iPart}${paddedFrac}`.replace(/^0+/, '') || '0';
  return BigInt(full);
}

type Body = {
  session_id: string;
  wallet_address: string;
  destination: string;
  phase_id: number;
  claim_amount: string | number;
  idempotency_key?: string | null;
};

export async function POST(req: NextRequest) {
  // --- parse body ---
  let body: Body | null = null;
  try {
    body = (await req.json().catch(() => null)) as Body | null;
  } catch {
    body = null;
  }
  if (!body) return json(400, { success: false, error: 'BAD_JSON' });

  const sessionId = asStr(body.session_id);
  const wallet = asStr(body.wallet_address);
  const destination = asStr(body.destination);
  const phaseId = asNum(body.phase_id);
  const idemKey = asStr(body.idempotency_key ?? '');

  const claimAmountRaw = (body.claim_amount ?? '').toString().trim();

  if (!sessionId || !wallet || !destination || !claimAmountRaw) {
    return json(400, { success: false, error: 'MISSING_FIELDS' });
  }
  if (!Number.isFinite(phaseId) || phaseId <= 0) {
    return json(400, { success: false, error: 'BAD_PHASE_ID' });
  }

  // ✅ production önerisi: idempotency key zorunlu
  if (!idemKey) {
    return json(400, { success: false, error: 'MISSING_IDEMPOTENCY_KEY' });
  }

  let walletPk: PublicKey;
  let destPk: PublicKey;
  try {
    walletPk = new PublicKey(wallet);
    destPk = new PublicKey(destination);
  } catch {
    return json(400, { success: false, error: 'INVALID_PUBKEY' });
  }

  const MEGY_MINT = asStr(process.env.MEGY_MINT || '');
  if (!MEGY_MINT) return json(500, { success: false, error: 'MISSING_MEGY_MINT' });

  const MEGY_DECIMALS = Number(process.env.MEGY_DECIMALS ?? 9);
  if (!Number.isFinite(MEGY_DECIMALS) || MEGY_DECIMALS < 0 || MEGY_DECIMALS > 18) {
    return json(500, { success: false, error: 'BAD_MEGY_DECIMALS' });
  }

  let amountBase: bigint;
  let amountAsNumberForDb: number;
  try {
    amountBase = toBaseUnits(claimAmountRaw, MEGY_DECIMALS);
    const n = Number(claimAmountRaw);
    if (!Number.isFinite(n) || n <= 0) throw new Error('BAD_AMOUNT');
    amountAsNumberForDb = n;
  } catch {
    return json(400, { success: false, error: 'BAD_AMOUNT' });
  }

  const mintPk = new PublicKey(MEGY_MINT);

  // Canonical request hash (idempotency reuse mismatch guard)
  const requestHash = sha256Hex(`v2|${wallet}|${destination}|${phaseId}|${claimAmountRaw}`);

  // --- Idempotency: if exists, verify same request_hash, then return safely ---
  const existing = await sql`
    SELECT id, status, tx_signature, request_hash
    FROM claims
    WHERE idempotency_key = ${idemKey}
    LIMIT 1
  `;
  if (existing?.length) {
    const ex = existing[0];

    // idemKey reuse with different body -> 409
    if (String(ex.request_hash || '') && String(ex.request_hash) !== requestHash) {
      return json(409, {
        success: false,
        error: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
      });
    }

    // return based on status
    return json(200, {
      success: true,
      deduped: true,
      status: ex.status,
      tx_signature: ex.tx_signature ?? null,
    });
  }

  // --- Step 1: DB reservation (short TX) ---
  let claimRowId: number | null = null;

  try {
    await sql`BEGIN`;

    // Lock session row
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

    // keep destination updated
    if (String(s[0].destination) !== destination) {
      await sql`
        UPDATE claim_sessions
        SET destination = ${destination}
        WHERE id = ${sessionId}
      `;
    }

    // advisory lock to serialize per (wallet, phase, destination)
    await sql`
      SELECT pg_advisory_xact_lock(hashtext(${`claim|${wallet}|${phaseId}|${destination}`}))
    `;

    // re-check claimable inside TX (race safe)
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
          AND status IN ('created','succeeded') -- treat pending as reserved
      )
      SELECT
        (SELECT snap_amount FROM snap) AS snap_amount,
        (SELECT claimed_amount FROM cl) AS claimed_amount
    `;

    const snap = asNum(rows?.[0]?.snap_amount);
    const claimed = asNum(rows?.[0]?.claimed_amount);
    const claimable = Math.max(0, snap - claimed);

    if (amountAsNumberForDb > claimable) {
      await sql`ROLLBACK`;
      return json(409, {
        success: false,
        error: 'AMOUNT_EXCEEDS_PHASE_CLAIMABLE',
        want: amountAsNumberForDb,
        can: claimable,
        phase_id: phaseId,
      });
    }

    // Insert reserved claim row BEFORE on-chain.
    // NOTE: This requires claims.tx_signature to be nullable (recommended migration above).
    const ins = await sql`
      INSERT INTO claims (
        wallet_address,
        claim_amount,
        destination,
        tx_signature,
        sol_fee_paid,
        timestamp,
        sol_fee_amount,
        phase_id,
        session_id,
        status,
        idempotency_key,
        request_hash,
        error
      )
      VALUES (
        ${wallet},
        ${amountAsNumberForDb},
        ${destination},
        ${null},
        ${true},
        now(),
        ${0},
        ${phaseId},
        ${sessionId},
        ${'created'},
        ${idemKey},
        ${requestHash},
        ${null}
      )
      RETURNING id
    `;

    claimRowId = Number(ins?.[0]?.id ?? 0) || null;
    if (!claimRowId) throw new Error('RESERVE_INSERT_FAILED');

    await sql`COMMIT`;
  } catch (e) {
    try {
      await sql`ROLLBACK`;
    } catch {}
    console.error('reservation failed:', e);
    return json(500, { success: false, error: 'DB_RESERVATION_FAILED' });
  }

  // --- Step 2: On-chain transfer ---
  let sig = '';
  try {
    const conn = new Connection(RPC_URL, 'confirmed');
    const treasurySigner = loadKeypair();
    const treasuryOwner = treasurySigner.publicKey;

    const fromAta = await getAssociatedTokenAddress(mintPk, treasuryOwner, false);
    const toAta = await getAssociatedTokenAddress(mintPk, destPk, false);

    const ix: any[] = [];

    // Ensure destination ATA exists
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

    ix.push(createTransferInstruction(fromAta, toAta, treasuryOwner, amountBase));

    const tx = new Transaction().add(...ix);
    tx.feePayer = treasuryOwner;

    const latest = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;

    tx.sign(treasurySigner);

    sig = await conn.sendRawTransaction(tx.serialize(), {
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

    if (conf?.value?.err) throw new Error('CLAIM_TX_FAILED');
  } catch (e: any) {
    const msg = String(e?.message || 'TRANSFER_FAILED');
    console.error('on-chain transfer failed:', e);

    // Mark claim failed (do NOT leave it as reserved forever)
    try {
      await sql`
        UPDATE claims
        SET status = ${'failed'}, error = ${msg}
        WHERE id = ${claimRowId}
      `;
    } catch (e2) {
      console.error('failed to mark claim failed:', e2);
    }

    return json(500, { success: false, error: msg });
  }

  // --- Step 3: Finalize in DB (short TX) ---
  try {
    await sql`BEGIN`;

    // Move created -> succeeded exactly once
    const up = await sql`
      UPDATE claims
      SET status = ${'succeeded'}, tx_signature = ${sig}, error = ${null}
      WHERE id = ${claimRowId} AND status = ${'created'}
      RETURNING id
    `;

    const didTransition = !!up?.length;

    // Only increment session totals if we truly transitioned to succeeded now
    if (didTransition) {
      await sql`
        UPDATE claim_sessions
        SET total_claimed_in_session = COALESCE(total_claimed_in_session, 0) + ${amountAsNumberForDb}
        WHERE id = ${sessionId}
      `;
    }

    // Optional: close session if total claimable across all phases is 0
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
          AND status IN ('created','succeeded')
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
      status: 'succeeded',
      session_closed: closed,
      total_claimable_remaining: totalClaimable,
      megy_decimals: MEGY_DECIMALS,
    });
  } catch (e: any) {
    try {
      await sql`ROLLBACK`;
    } catch {}
    console.error('finalize failed after transfer:', e);

    // worst-case: tx succeeded but finalize failed.
    // We still return sig so user can prove success.
    return json(500, {
      success: false,
      error: 'DB_FINALIZE_FAILED_AFTER_TRANSFER',
      tx_signature: sig,
    });
  }
}
