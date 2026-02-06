// app/api/claim/execute/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';
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

  // allow digits and one dot
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('BAD_AMOUNT_FORMAT');

  const [iPart, fPartRaw = ''] = raw.split('.');
  const fPart = fPartRaw.slice(0, decimals);

  const paddedFrac = fPart.padEnd(decimals, '0'); // right-pad
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
  const idemKey = asStr(body.idempotency_key ?? '') || null;

  const claimAmountRaw = (body.claim_amount ?? '').toString().trim();

  if (!sessionId || !wallet || !destination || !claimAmountRaw) {
    return json(400, { success: false, error: 'MISSING_FIELDS' });
  }
  if (!Number.isFinite(phaseId) || phaseId <= 0) {
    return json(400, { success: false, error: 'BAD_PHASE_ID' });
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

    // DB numeric alanına "human amount" olarak yazacağız (senin UI mantığıyla uyumlu).
    // İstersen ileride base units'i ayrıca kolona ekleriz.
    const n = Number(claimAmountRaw);
    if (!Number.isFinite(n) || n <= 0) throw new Error('BAD_AMOUNT');
    amountAsNumberForDb = n;
  } catch {
    return json(400, { success: false, error: 'BAD_AMOUNT' });
  }

  const mintPk = new PublicKey(MEGY_MINT);

  // request_hash: content-based idempotency (double-submit guard)
  const requestHash = sha256Hex(
    `v1|${wallet}|${destination}|${phaseId}|${claimAmountRaw}`
  );

  // --- quick idempotency: if idemKey exists and claim already recorded, return it ---
  if (idemKey) {
    const ex = await sql`
      SELECT id, status, tx_signature, session_id, phase_id, wallet_address, destination, claim_amount
      FROM claims
      WHERE idempotency_key = ${idemKey}
      LIMIT 1
    `;
    if (ex?.length) {
      return json(200, {
        success: true,
        tx_signature: ex[0].tx_signature,
        deduped: true,
        status: ex[0].status,
      });
    }
  }

  // --- content-based dedupe: same requestHash in recent window ---
  // (helps if frontend accidentally generated a different UUID on retry)
  const recent = await sql`
    SELECT id, status, tx_signature, timestamp
    FROM claims
    WHERE request_hash = ${requestHash}
      AND wallet_address = ${wallet}
      AND phase_id = ${phaseId}
      AND timestamp > now() - interval '3 minutes'
    ORDER BY id DESC
    LIMIT 1
  `;
  if (recent?.length) {
    return json(200, {
      success: true,
      tx_signature: recent[0].tx_signature,
      deduped: true,
      status: recent[0].status,
      via: 'request_hash',
    });
  }

  // --- DB transaction: lock session + serialize per (wallet, phase, destination) ---
  await sql`BEGIN`;
  try {
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

    // Optional: keep destination updated
    if (String(s[0].destination) !== destination) {
      await sql`
        UPDATE claim_sessions
        SET destination = ${destination}
        WHERE id = ${sessionId}
      `;
    }

    // Advisory lock (xact-scoped): prevents concurrent execute for same params
    // Using hashtext ensures bigint key.
    await sql`
      SELECT pg_advisory_xact_lock(hashtext(${`claim|${wallet}|${phaseId}|${destination}`}))
    `;

    // Re-check claimable within the same transaction (prevents race)
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

    // Keep DB tx OPEN while we do on-chain.
    // This is intentional: prevents concurrent claims until we insert.
  } catch (e) {
    try { await sql`ROLLBACK`; } catch {}
    console.error('execute precheck failed:', e);
    return json(500, { success: false, error: 'DB_PRECHECK_FAILED' });
  }

  // --- On-chain transfer (server signs) ---
  let sig = '';
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

    ix.push(
      createTransferInstruction(
        fromAta,
        toAta,
        treasuryOwner,
        amountBase
      )
    );

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

    if (conf?.value?.err) {
      throw new Error('CLAIM_TX_FAILED');
    }
  } catch (e: any) {
    try { await sql`ROLLBACK`; } catch {}
    console.error('on-chain transfer failed:', e);
    return json(500, { success: false, error: String(e?.message || 'TRANSFER_FAILED') });
  }

  // --- Record claim + commit ---
  try {
    // Insert claim row (tx_signature NOT NULL satisfied)
    // Idempotency: if same idemKey races, unique index will protect.
    // If idemKey is null, content-based request_hash still helps.
    let inserted: any[] = [];
    try {
      inserted = await sql`
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
          ${sig},
          ${true},
          now(),
          ${0},
          ${phaseId},
          ${sessionId},
          ${'confirmed'},
          ${idemKey},
          ${requestHash},
          ${null}
        )
        RETURNING id
      `;
    } catch (e: any) {
      // If idempotency_key conflict (or request_hash unique if you ever add it), fetch existing
      if (idemKey) {
        const ex = await sql`
          SELECT id, status, tx_signature
          FROM claims
          WHERE idempotency_key = ${idemKey}
          LIMIT 1
        `;
        if (ex?.length) {
          await sql`COMMIT`;
          return json(200, {
            success: true,
            tx_signature: ex[0].tx_signature,
            deduped: true,
            status: ex[0].status,
          });
        }
      }

      // If not idemKey, try request_hash
      const ex2 = await sql`
        SELECT id, status, tx_signature
        FROM claims
        WHERE request_hash = ${requestHash}
          AND wallet_address = ${wallet}
          AND phase_id = ${phaseId}
        ORDER BY id DESC
        LIMIT 1
      `;
      if (ex2?.length) {
        await sql`COMMIT`;
        return json(200, {
          success: true,
          tx_signature: ex2[0].tx_signature,
          deduped: true,
          status: ex2[0].status,
          via: 'request_hash',
        });
      }

      throw e;
    }

    if (!inserted?.length) {
      throw new Error('CLAIM_INSERT_FAILED');
    }

    await sql`
      UPDATE claim_sessions
      SET total_claimed_in_session = COALESCE(total_claimed_in_session, 0) + ${amountAsNumberForDb}
      WHERE id = ${sessionId}
    `;

    // Close session if user has nothing left across ALL phases (optional behavior)
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
      megy_decimals: MEGY_DECIMALS,
    });
  } catch (e: any) {
    try { await sql`ROLLBACK`; } catch {}
    console.error('DB record failed after transfer:', e);
    return json(500, {
      success: false,
      error: 'DB_RECORD_FAILED_AFTER_TRANSFER',
      tx_signature: sig,
    });
  }
}
