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

function baseToDecimalString(base: bigint, decimals: number): string {
  const neg = base < 0n;
  const b = neg ? -base : base;

  const s = b.toString();
  if (decimals <= 0) return (neg ? '-' : '') + s;

  const pad = decimals + 1;
  const padded = s.length < pad ? s.padStart(pad, '0') : s;

  const i = padded.slice(0, -decimals);
  let f = padded.slice(-decimals);

  // trim trailing zeros
  f = f.replace(/0+$/, '');
  const out = f ? `${i}.${f}` : i;
  return (neg ? '-' : '') + out;
}

type Body = {
  session_id: string;
  wallet_address: string;
  destination: string;
  phase_id: number; // 0 => all phases
  claim_amount: string | number;
  idempotency_key?: string | null;
};

type Split = {
  phase_id: number;
  amount_base: bigint;
  amount_human: string; // decimal string
  idem_key: string;     // for this row
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
  const phaseIdRaw = asNum(body.phase_id);
  const idemKeyRoot = asStr(body.idempotency_key ?? '');

  const claimAmountRaw = (body.claim_amount ?? '').toString().trim();

  if (!sessionId || !wallet || !destination || !claimAmountRaw) {
    return json(400, { success: false, error: 'MISSING_FIELDS' });
  }

  const isAllPhases = phaseIdRaw === 0;

  // ✅ production önerisi: idempotency key zorunlu
  if (!idemKeyRoot) {
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
  if (!MEGY_MINT) {
    return json(500, {
      success: false,
      error: 'Claim is not available yet. MEGY token is not live.',
    });
  }

  const MEGY_DECIMALS = Number(process.env.MEGY_DECIMALS ?? 9);
  if (!Number.isFinite(MEGY_DECIMALS) || MEGY_DECIMALS < 0 || MEGY_DECIMALS > 18) {
    return json(500, { success: false, error: 'BAD_MEGY_DECIMALS' });
  }

  let amountBaseTotal: bigint;
  try {
    amountBaseTotal = toBaseUnits(claimAmountRaw, MEGY_DECIMALS);
    const n = Number(claimAmountRaw);
    if (!Number.isFinite(n) || n <= 0) throw new Error('BAD_AMOUNT');
    if (amountBaseTotal <= 0n) throw new Error('BAD_AMOUNT');
  } catch {
    return json(400, { success: false, error: 'BAD_AMOUNT' });
  }

  const mintPk = new PublicKey(MEGY_MINT);

  // Canonical request hash (root)
  const requestHashRoot = sha256Hex(
    `v3|${wallet}|${destination}|${isAllPhases ? 'ALL' : String(phaseIdRaw)}|${claimAmountRaw}`
  );

  // --- Idempotency: single phase (exact match) ---
  if (!isAllPhases) {
    if (!Number.isFinite(phaseIdRaw) || phaseIdRaw <= 0) {
      return json(400, { success: false, error: 'BAD_PHASE_ID' });
    }

    const existing = await sql`
      SELECT id, status, tx_signature, request_hash
      FROM claims
      WHERE idempotency_key = ${idemKeyRoot}
      LIMIT 1
    `;

    if (existing?.length) {
      const ex = existing[0];

      if (String(ex.request_hash || '') && String(ex.request_hash) !== requestHashRoot) {
        return json(409, {
          success: false,
          error: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
        });
      }

      return json(200, {
        success: true,
        deduped: true,
        scope: 'phase',
        phase_id: phaseIdRaw,
        status: ex.status,
        tx_signature: ex.tx_signature ?? null,
      });
    }
  } else {
    // --- Idempotency: all phases (prefix check) ---
    const pref = `${idemKeyRoot}#`;
    const existingAll = await sql`
      SELECT id, status, tx_signature, request_hash
      FROM claims
      WHERE idempotency_key LIKE ${pref + '%'}
      ORDER BY id ASC
      LIMIT 1
    `;

    if (existingAll?.length) {
      const ex = existingAll[0];

      if (String(ex.request_hash || '') && String(ex.request_hash) !== requestHashRoot) {
        return json(409, {
          success: false,
          error: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
        });
      }

      return json(200, {
        success: true,
        deduped: true,
        scope: 'all',
        status: ex.status,
        tx_signature: ex.tx_signature ?? null,
      });
    }
  }

  // --- Step 1: DB reservation (short TX) ---
  // For all phases: reserve multiple rows, one per phase split.
  let claimRowIds: number[] = [];
  let splits: Split[] = [];

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

    // Serialize per (wallet, destination) (and phase scope)
    await sql`
      SELECT pg_advisory_xact_lock(hashtext(${`claim|${wallet}|${destination}|${isAllPhases ? 'ALL' : String(phaseIdRaw)}`}))
    `;

    if (!isAllPhases) {
      const phaseId = phaseIdRaw;

      // re-check claimable inside TX (race safe)
      const rows = await sql`
        WITH snap AS (
          SELECT COALESCE(SUM(megy_amount_base), 0) AS snap_base
          FROM claim_snapshots
          WHERE wallet_address = ${wallet} AND phase_id = ${phaseId}
        ),
        cl AS (
          SELECT COALESCE(SUM(claim_amount_base), 0) AS claimed_base
          FROM claims
          WHERE wallet_address = ${wallet} AND phase_id = ${phaseId}
            AND status IN ('created','succeeded')
        )
        SELECT
          (SELECT snap_base FROM snap) AS snap_base,
          (SELECT claimed_base FROM cl) AS claimed_base
      `;

      const snapBase = BigInt(String(rows?.[0]?.snap_base ?? '0'));
      const claimedBase = BigInt(String(rows?.[0]?.claimed_base ?? '0'));
      const claimableBase = snapBase > claimedBase ? (snapBase - claimedBase) : 0n;

      if (amountBaseTotal > claimableBase) {
        await sql`ROLLBACK`;
        return json(409, {
          success: false,
          error: 'AMOUNT_EXCEEDS_PHASE_CLAIMABLE',
          phase_id: phaseId,
        });
      }

      const amountHuman = baseToDecimalString(amountBaseTotal, MEGY_DECIMALS);

      const ins = await sql`
        INSERT INTO claims (
          wallet_address,
          claim_amount,
          claim_amount_base,
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
          ${amountHuman},
          ${amountBaseTotal.toString()},
          ${destination},
          ${null},
          ${true},
          now(),
          ${0},
          ${phaseId},
          ${sessionId},
          ${'created'},
          ${idemKeyRoot},
          ${requestHashRoot},
          ${null}
        )
        RETURNING id
      `;

      const id = Number(ins?.[0]?.id ?? 0) || 0;
      if (!id) throw new Error('RESERVE_INSERT_FAILED');

      claimRowIds = [id];
      splits = [{
        phase_id: phaseId,
        amount_base: amountBaseTotal,
        amount_human: amountHuman,
        idem_key: idemKeyRoot,
      }];
    } else {
      // ALL PHASES:
      // Find remaining claimable per phase (wallet has snapshots).
      const rem = await sql`
        WITH snaps AS (
          SELECT phase_id, COALESCE(SUM(megy_amount_base), 0) AS snap_base
          FROM claim_snapshots
          WHERE wallet_address = ${wallet}
          GROUP BY phase_id
        ),
        cls AS (
          SELECT phase_id, COALESCE(SUM(claim_amount_base), 0) AS claimed_base
          FROM claims
          WHERE wallet_address = ${wallet}
            AND status IN ('created','succeeded')
          GROUP BY phase_id
        )
        SELECT
          s.phase_id,
          (s.snap_base - COALESCE(c.claimed_base, 0)) AS remaining_base
        FROM snaps s
        LEFT JOIN cls c ON c.phase_id = s.phase_id
        WHERE (s.snap_base - COALESCE(c.claimed_base, 0)) > 0
        ORDER BY s.phase_id ASC
      `;

      const list = (rem ?? [])
        .map((r: any) => ({
          phase_id: Number(r.phase_id),
          remaining_base: BigInt(String(r.remaining_base ?? '0')),
        }))
        .filter((x: any) => Number.isFinite(x.phase_id) && x.phase_id > 0 && x.remaining_base > 0n);

      if (list.length === 0) {
        await sql`ROLLBACK`;
        return json(409, { success: false, error: 'NO_CLAIMABLE_BALANCE' });
      }

      // Compute total claimable across all phases
      const totalClaimable = list.reduce((acc, x) => acc + x.remaining_base, 0n);
      if (amountBaseTotal > totalClaimable) {
        await sql`ROLLBACK`;
        return json(409, {
          success: false,
          error: 'AMOUNT_EXCEEDS_TOTAL_CLAIMABLE',
        });
      }

      // Allocate from oldest phase first (ASC)
      let left = amountBaseTotal;
      const alloc: { phase_id: number; amount_base: bigint }[] = [];

      for (const p of list) {
        if (left <= 0n) break;
        const take = left <= p.remaining_base ? left : p.remaining_base;
        if (take > 0n) {
          alloc.push({ phase_id: p.phase_id, amount_base: take });
          left -= take;
        }
      }

      if (left !== 0n) {
        await sql`ROLLBACK`;
        return json(500, { success: false, error: 'ALLOCATION_MISMATCH' });
      }

      // Insert one claim row per phase split
      const ids: number[] = [];
      const sp: Split[] = [];

      for (const a of alloc) {
        const childKey = `${idemKeyRoot}#${a.phase_id}`;
        const amountHuman = baseToDecimalString(a.amount_base, MEGY_DECIMALS);

        const ins = await sql`
          INSERT INTO claims (
            wallet_address,
            claim_amount,
            claim_amount_base,
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
            ${amountHuman},
            ${a.amount_base.toString()},
            ${destination},
            ${null},
            ${true},
            now(),
            ${0},
            ${a.phase_id},
            ${sessionId},
            ${'created'},
            ${childKey},
            ${requestHashRoot},
            ${null}
          )
          RETURNING id
        `;

        const id = Number(ins?.[0]?.id ?? 0) || 0;
        if (!id) throw new Error('RESERVE_INSERT_FAILED');
        ids.push(id);

        sp.push({
          phase_id: a.phase_id,
          amount_base: a.amount_base,
          amount_human: amountHuman,
          idem_key: childKey,
        });
      }

      claimRowIds = ids;
      splits = sp;
    }

    await sql`COMMIT`;
  } catch (e) {
    try {
      await sql`ROLLBACK`;
    } catch {}
    console.error('reservation failed:', e);
    return json(500, { success: false, error: 'DB_RESERVATION_FAILED' });
  }

  // --- Step 2: On-chain transfer (single tx: total amount) ---
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

    ix.push(createTransferInstruction(fromAta, toAta, treasuryOwner, amountBaseTotal));

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

    // Mark all reserved claim rows failed
    try {
      if (claimRowIds.length) {
        await sql`
          UPDATE claims
          SET status = ${'failed'}, error = ${msg}
          WHERE id = ANY(${claimRowIds})
        `;
      }
    } catch (e2) {
      console.error('failed to mark claim failed:', e2);
    }

    return json(500, { success: false, error: msg });
  }

  // --- Step 3: Finalize in DB (short TX) ---
  try {
    await sql`BEGIN`;

    // Move created -> succeeded exactly once (all rows)
    const up = await sql`
      UPDATE claims
      SET status = ${'succeeded'}, tx_signature = ${sig}, error = ${null}
      WHERE id = ANY(${claimRowIds}) AND status = ${'created'}
      RETURNING id, claim_amount
    `;

    const didTransition = (up?.length ?? 0) > 0;

    // increment session totals once (using total human as string is fine)
    if (didTransition) {
      const totalHuman = baseToDecimalString(amountBaseTotal, MEGY_DECIMALS);
      await sql`
        UPDATE claim_sessions
        SET total_claimed_in_session = COALESCE(total_claimed_in_session, 0) + ${totalHuman}
        WHERE id = ${sessionId}
      `;
    }

    // Optional: close session if total claimable across all phases is 0
    const totals = await sql`
      WITH snaps AS (
        SELECT COALESCE(SUM(megy_amount_base), 0) AS snap_base
        FROM claim_snapshots
        WHERE wallet_address = ${wallet}
      ),
      cls AS (
        SELECT COALESCE(SUM(claim_amount_base), 0) AS claimed_base
        FROM claims
        WHERE wallet_address = ${wallet}
          AND status IN ('created','succeeded')
      )
      SELECT
        (SELECT snap_base FROM snaps) AS snap_base,
        (SELECT claimed_base FROM cls) AS claimed_base
    `;

    const snapBaseAll = BigInt(String(totals?.[0]?.snap_base ?? '0'));
    const claimedBaseAll = BigInt(String(totals?.[0]?.claimed_base ?? '0'));
    const totalClaimableBase = snapBaseAll > claimedBaseAll ? (snapBaseAll - claimedBaseAll) : 0n;

    let closed = false;
    if (totalClaimableBase <= 0n) {
      await sql`
        UPDATE claim_sessions
        SET status = 'closed', closed_at = now()
        WHERE id = ${sessionId} AND status = 'open'
      `;
      closed = true;
    }

    const totalClaimableRemaining = baseToDecimalString(totalClaimableBase, MEGY_DECIMALS);

    await sql`COMMIT`;

    return json(200, {
      success: true,
      scope: isAllPhases ? 'all' : 'phase',
      tx_signature: sig,
      status: 'succeeded',
      session_closed: closed,
      total_claimable_remaining: totalClaimableRemaining,
      megy_decimals: MEGY_DECIMALS,
      splits: splits.map(s => ({
        phase_id: s.phase_id,
        amount: s.amount_human,
      })),
    });
  } catch (e: any) {
    try {
      await sql`ROLLBACK`;
    } catch {}
    console.error('finalize failed after transfer:', e);

    // worst-case: tx succeeded but finalize failed.
    return json(500, {
      success: false,
      error: 'DB_FINALIZE_FAILED_AFTER_TRANSFER',
      tx_signature: sig,
    });
  }
}
