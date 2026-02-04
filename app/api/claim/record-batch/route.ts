// app/api/claim/record-batch/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

type Item = { phase_id: number; claim_amount: number };

type Body = {
  session_id: string;
  wallet_address: string;
  destination: string;
  tx_signature: string;
  items: Item[];
};

function bad(msg: string, code = 400, extra?: any) {
  return NextResponse.json({ success: false, error: msg, ...extra }, { status: code });
}

function asNum(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function POST(req: NextRequest) {
  const sql = neon(process.env.DATABASE_URL!);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad('BAD_JSON');
  }

  const sessionId = String(body.session_id || '').trim();
  const wallet = String(body.wallet_address || '').trim();
  const destination = String(body.destination || '').trim();
  const txSig = String(body.tx_signature || '').trim();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!sessionId) return bad('MISSING_SESSION_ID');
  if (!wallet) return bad('MISSING_WALLET');
  if (!destination) return bad('MISSING_DESTINATION');
  if (!txSig) return bad('MISSING_TX_SIGNATURE');
  if (!items.length) return bad('EMPTY_ITEMS');
  if (items.length !== 1) return bad('BATCH_NOT_SUPPORTED_USE_ONE_ITEM', 400, { items_len: items.length });

  const it = items[0];
  const pid = asNum(it.phase_id);
  const amt = asNum(it.claim_amount);

  if (!Number.isFinite(pid) || pid <= 0) return bad('BAD_ITEM_PHASE');
  if (!Number.isFinite(amt) || amt <= 0) return bad('BAD_ITEM_AMOUNT');

  await sql`BEGIN`;
  try {
    // 1) Session open mu? + wallet + destination match (FOR UPDATE → race önle)
    const s = await sql`
      SELECT id, wallet_address, destination, status
      FROM claim_sessions
      WHERE id = ${sessionId}
      LIMIT 1
      FOR UPDATE
    `;

    if (!s?.length) {
      await sql`ROLLBACK`;
      return bad('SESSION_NOT_FOUND', 404);
    }
    if (String(s[0].wallet_address) !== wallet) {
      await sql`ROLLBACK`;
      return bad('SESSION_WALLET_MISMATCH', 403);
    }
    if (String(s[0].destination) !== destination) {
      await sql`ROLLBACK`;
      return bad('SESSION_DESTINATION_MISMATCH', 403);
    }
    if (String(s[0].status) !== 'open') {
      await sql`ROLLBACK`;
      return bad('SESSION_NOT_OPEN', 409);
    }

    // 2) tx_signature reuse guard (explicit)
    const usedTx = await sql`
      SELECT id FROM claims WHERE tx_signature = ${txSig} LIMIT 1
    `;
    if (usedTx?.length) {
      await sql`ROLLBACK`;
      return bad('TX_SIGNATURE_ALREADY_USED', 409, { tx_signature: txSig });
    }

    // 3) Faz bazında claimable hesapla ve validasyon (tek phase)
    const rows = await sql`
      WITH snap AS (
        SELECT COALESCE(SUM(megy_amount), 0) AS snap_amount
        FROM claim_snapshots
        WHERE wallet_address = ${wallet} AND phase_id = ${pid}
      ),
      cl AS (
        SELECT COALESCE(SUM(claim_amount), 0) AS claimed_amount
        FROM claims
        WHERE wallet_address = ${wallet} AND phase_id = ${pid}
      )
      SELECT
        (SELECT snap_amount FROM snap) AS snap_amount,
        (SELECT claimed_amount FROM cl) AS claimed_amount
    `;

    const snap = asNum(rows?.[0]?.snap_amount);
    const claimed = asNum(rows?.[0]?.claimed_amount);
    const claimable = Math.max(0, snap - claimed);

    if (amt > claimable) {
      await sql`ROLLBACK`;
      return bad('AMOUNT_EXCEEDS_PHASE_CLAIMABLE', 409, { phase_id: pid, want: amt, can: claimable });
    }

    // 4) Insert (tek satır)
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
        ${pid},
        ${wallet},
        ${amt},
        ${destination},
        ${txSig},
        ${sessionId},
        ${false},
        ${0},
        now()
      )
      RETURNING id
    `;

    if (!ins?.length) {
      await sql`ROLLBACK`;
      return bad('CLAIM_INSERT_FAILED', 500);
    }

    // 5) Session metrik güncelle
    await sql`
      UPDATE claim_sessions
      SET total_claimed_in_session = COALESCE(total_claimed_in_session, 0) + ${amt}
      WHERE id = ${sessionId}
    `;

    // 6) Total claimable kaldı mı? Kalmadıysa session'ı kapat.
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

    return NextResponse.json({
      success: true,
      inserted_rows: 1,
      inserted_sum: amt,
      session_closed: closed,
      total_claimable_remaining: totalClaimable,
    });
  } catch (e) {
    try { await sql`ROLLBACK`; } catch {}
    console.error('record-batch failed:', e);
    return bad('INTERNAL_ERROR', 500);
  }
}
