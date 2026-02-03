// app/api/claim/record-batch/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

type Item = {
  phase_id: number;
  claim_amount: number;
};

type Body = {
  session_id: string;
  wallet_address: string;
  destination: string;
  tx_signature: string; // claim tx signature (unique)
  items: Item[];
};

function bad(msg: string, code = 400, extra?: any) {
  return NextResponse.json(
    { success: false, error: msg, ...extra },
    { status: code }
  );
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

  // --------------------------------------------------
  // 1) Session doğrulama (wallet + destination + open)
  // --------------------------------------------------
  const s = await sql`
    SELECT id, wallet_address, destination, status
    FROM claim_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `;

  if (!s?.length) return bad('SESSION_NOT_FOUND', 404);
  if (String(s[0].wallet_address) !== wallet)
    return bad('SESSION_WALLET_MISMATCH', 403);
  if (String(s[0].destination) !== destination)
    return bad('SESSION_DESTINATION_MISMATCH', 403);
  if (String(s[0].status) !== 'open')
    return bad('SESSION_NOT_OPEN', 409);

  // --------------------------------------------------
  // 2) tx_signature reuse engeli (replay protection)
  // --------------------------------------------------
  const usedTx = await sql`
    SELECT id FROM claims WHERE tx_signature = ${txSig} LIMIT 1
  `;
  if (usedTx?.length) {
    return bad('CLAIM_TX_ALREADY_USED', 409);
  }

  // --------------------------------------------------
  // 3) Faz bazında claimable hesaplama
  // --------------------------------------------------
  const phaseIds = items
    .map((x) => Number(x.phase_id))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!phaseIds.length) return bad('BAD_PHASE_IDS');

  const rows = await sql`
    WITH snap AS (
      SELECT phase_id, COALESCE(SUM(megy_amount), 0) AS snap_amount
      FROM claim_snapshots
      WHERE wallet_address = ${wallet}
        AND phase_id = ANY(${phaseIds}::int[])
      GROUP BY phase_id
    ),
    cl AS (
      SELECT phase_id, COALESCE(SUM(claim_amount), 0) AS claimed_amount
      FROM claims
      WHERE wallet_address = ${wallet}
        AND phase_id = ANY(${phaseIds}::int[])
      GROUP BY phase_id
    )
    SELECT
      p.phase_id,
      COALESCE(s.snap_amount, 0) AS snap_amount,
      COALESCE(c.claimed_amount, 0) AS claimed_amount
    FROM (SELECT UNNEST(${phaseIds}::int[]) AS phase_id) p
    LEFT JOIN snap s ON s.phase_id = p.phase_id
    LEFT JOIN cl c ON c.phase_id = p.phase_id
  `;

  const phaseMap = new Map<
    number,
    { snap: number; claimed: number; claimable: number }
  >();

  for (const r of rows) {
    const pid = Number(r.phase_id);
    const snap = Number(r.snap_amount ?? 0);
    const claimed = Number(r.claimed_amount ?? 0);
    const claimable = Math.max(0, snap - claimed);
    phaseMap.set(pid, { snap, claimed, claimable });
  }

  for (const it of items) {
    const pid = Number(it.phase_id);
    const amt = Number(it.claim_amount);

    if (!Number.isFinite(pid) || pid <= 0)
      return bad('BAD_ITEM_PHASE');
    if (!Number.isFinite(amt) || amt <= 0)
      return bad('BAD_ITEM_AMOUNT');

    const info = phaseMap.get(pid);
    const can = info ? info.claimable : 0;

    if (amt > can) {
      return bad('AMOUNT_EXCEEDS_PHASE_CLAIMABLE', 409, {
        phase_id: pid,
        want: amt,
        can,
      });
    }
  }

  // --------------------------------------------------
  // 4) Atomik insert (BEGIN / COMMIT / ROLLBACK)
  // --------------------------------------------------
  let inserted = 0;
  let insertedSum = 0;

  await sql`BEGIN`;
  try {
    for (const it of items) {
      const pid = Number(it.phase_id);
      const amt = Number(it.claim_amount);

      await sql`
        INSERT INTO claims (
          phase_id,
          wallet_address,
          claim_amount,
          destination,
          tx_signature,
          session_id
        )
        VALUES (
          ${pid},
          ${wallet},
          ${amt},
          ${destination},
          ${txSig},
          ${sessionId}
        )
      `;

      inserted += 1;
      insertedSum += amt;
    }

    await sql`
      UPDATE claim_sessions
      SET total_claimed_in_session =
        COALESCE(total_claimed_in_session, 0) + ${insertedSum}
      WHERE id = ${sessionId}
    `;

    await sql`COMMIT`;
  } catch (e) {
    await sql`ROLLBACK`;
    console.error('CLAIM_BATCH_FAILED:', e);
    return bad('CLAIM_BATCH_FAILED', 500);
  }

  // --------------------------------------------------
  // 5) Total claimable kaldı mı? (session close)
  // --------------------------------------------------
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

  const snapSum = Number(totals?.[0]?.snap_sum ?? 0);
  const claimedSum = Number(totals?.[0]?.claimed_sum ?? 0);
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

  // --------------------------------------------------
  // 6) Final response
  // --------------------------------------------------
  return NextResponse.json({
    success: true,
    inserted_rows: inserted,
    inserted_sum: insertedSum,
    session_closed: closed,
    total_claimable_remaining: totalClaimable,
  });
}
