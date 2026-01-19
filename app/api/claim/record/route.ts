// app/api/claim/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAppEnabled, requireClaimOpen } from '@/app/api/_lib/feature-flags';

type Body = {
  phase_id?: number;

  wallet_address?: string;
  claim_amount?: number;

  destination?: string;
  tx_signature?: string;

  // DB: claims.sol_fee_paid boolean, claims.sol_fee_amount numeric
  sol_fee_paid?: boolean;
  sol_fee_amount?: number;
};

export async function POST(req: NextRequest) {
  try {
    // Server-side enforcement
    await requireAppEnabled();
    await requireClaimOpen();

    const body = (await req.json()) as Body;

    const phase_id = Number(body?.phase_id);
    const wallet_address = body?.wallet_address;
    const destination = body?.destination;
    const tx_signature = body?.tx_signature;

    const claim_amount = body?.claim_amount;
    const sol_fee_paid = body?.sol_fee_paid;
    const sol_fee_amount = body?.sol_fee_amount;

    // -----------------------------
    // Validation
    // -----------------------------
    if (!Number.isInteger(phase_id) || phase_id <= 0) {
      return NextResponse.json({ success: false, error: 'phase_id is required' }, { status: 400 });
    }
    if (!wallet_address || typeof wallet_address !== 'string') {
      return NextResponse.json({ success: false, error: 'wallet_address is required' }, { status: 400 });
    }
    if (!destination || typeof destination !== 'string') {
      return NextResponse.json({ success: false, error: 'destination is required' }, { status: 400 });
    }
    if (!tx_signature || typeof tx_signature !== 'string') {
      return NextResponse.json({ success: false, error: 'tx_signature is required' }, { status: 400 });
    }
    if (claim_amount == null || !Number.isFinite(Number(claim_amount)) || Number(claim_amount) <= 0) {
      return NextResponse.json({ success: false, error: 'claim_amount must be a positive number' }, { status: 400 });
    }
    if (typeof sol_fee_paid !== 'boolean') {
      return NextResponse.json({ success: false, error: 'sol_fee_paid must be boolean' }, { status: 400 });
    }
    if (sol_fee_amount == null || !Number.isFinite(Number(sol_fee_amount)) || Number(sol_fee_amount) < 0) {
      return NextResponse.json({ success: false, error: 'sol_fee_amount must be a non-negative number' }, { status: 400 });
    }

    // -----------------------------
    // Idempotency: same tx_signature => no-op
    // -----------------------------
    const existing = await sql`
      SELECT 1 FROM claims WHERE tx_signature = ${tx_signature} AND phase_id = ${phase_id} LIMIT 1
    `;
    if ((existing as any[]).length > 0) {
      return NextResponse.json({ success: true, deduped: true });
    }

    // -----------------------------
    // Phase must be snapshotted/finalized (hard safety)
    // -----------------------------
    const phaseRows = await sql`
      SELECT id, snapshot_taken_at, status_v2
      FROM phases
      WHERE id = ${phase_id}
      LIMIT 1
    `;
    const phase = (phaseRows as any[])[0];
    if (!phase) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
    }
    if (!phase.snapshot_taken_at || String(phase.status_v2 || '').toLowerCase() !== 'finalized') {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FINALIZED' }, { status: 409 });
    }

    // -----------------------------
    // Compute claimable from claim_snapshots (finalized truth)
    // claim_snapshots: megy_amount, phase_id, wallet_address
    // claims: claim_amount, phase_id, wallet_address
    // -----------------------------
    const finalizedRes = await sql`
      SELECT COALESCE(SUM(megy_amount),0)::float AS finalized
      FROM claim_snapshots
      WHERE wallet_address = ${wallet_address}
        AND phase_id = ${phase_id}
    `;
    const finalized = Number((finalizedRes[0] as any)?.finalized ?? 0);

    const claimedRes = await sql`
      SELECT COALESCE(SUM(claim_amount),0)::float AS claimed
      FROM claims
      WHERE wallet_address = ${wallet_address}
        AND phase_id = ${phase_id}
    `;
    const claimed = Number((claimedRes[0] as any)?.claimed ?? 0);

    const claimable = Math.max(finalized - claimed, 0);

    if (Number(claim_amount) > claimable + 1e-9) {
      return NextResponse.json(
        { success: false, error: 'CLAIM_EXCEEDS_AVAILABLE', finalized, claimed, claimable },
        { status: 409 },
      );
    }

    const timestamp = new Date().toISOString();

    await sql`
      INSERT INTO claims (
        phase_id,
        wallet_address,
        claim_amount,
        destination,
        tx_signature,
        sol_fee_paid,
        sol_fee_amount,
        timestamp
      )
      VALUES (
        ${phase_id},
        ${wallet_address},
        ${Number(claim_amount)},
        ${destination},
        ${tx_signature},
        ${sol_fee_paid},
        ${Number(sol_fee_amount)},
        ${timestamp}
      )
    `;

    return NextResponse.json({
      success: true,
      phase_id,
      finalized,
      claimed_after: claimed + Number(claim_amount),
      claimable_after: Math.max(claimable - Number(claim_amount), 0),
    });
  } catch (error: any) {
    console.error('[claim/record] error:', error);
    if (error?.status) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: error?.message || 'Internal error' }, { status: 500 });
  }
}
