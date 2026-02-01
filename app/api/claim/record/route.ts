// app/api/claim/record/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAppEnabled, requireClaimOpen } from '@/app/api/_lib/feature-flags';

type Body = {
  phase_id?: number;
  wallet_address?: string;
  claim_amount?: number;
  destination?: string;
  tx_signature?: string;
  sol_fee_paid?: boolean;
  sol_fee_amount?: number;
};

export async function POST(req: NextRequest) {
  try {
    await requireAppEnabled();
    await requireClaimOpen();

    const body = (await req.json()) as Body;

    const phase_id = Number(body?.phase_id);
    const wallet_address = body?.wallet_address;
    const destination = body?.destination;
    const tx_signature = body?.tx_signature;

    const claim_amount = Number(body?.claim_amount);
    const sol_fee_paid = body?.sol_fee_paid;
    const sol_fee_amount = Number(body?.sol_fee_amount ?? 0);

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
    if (!Number.isFinite(claim_amount) || claim_amount <= 0) {
      return NextResponse.json({ success: false, error: 'claim_amount must be a positive number' }, { status: 400 });
    }
    if (typeof sol_fee_paid !== 'boolean') {
      return NextResponse.json({ success: false, error: 'sol_fee_paid must be boolean' }, { status: 400 });
    }
    if (!Number.isFinite(sol_fee_amount) || sol_fee_amount < 0) {
      return NextResponse.json({ success: false, error: 'sol_fee_amount must be a non-negative number' }, { status: 400 });
    }

    // -----------------------------
    // Phase hard guard: snapshot must exist
    // (do NOT block on status_v2 null)
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
    if (!phase.snapshot_taken_at) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FINALIZED' }, { status: 409 });
    }

    const statusV2 = String(phase.status_v2 ?? '').toLowerCase();
    if (statusV2 && statusV2 !== 'finalized') {
      console.warn('[claim/record] snapshot exists but status_v2 != finalized (soft):', {
        phase_id,
        status_v2: phase.status_v2,
      });
    }

    // -----------------------------
    // Enforce + insert (race-safe-ish) + idempotency via ON CONFLICT
    // Requires UNIQUE(phase_id, tx_signature)
    // -----------------------------
    const rows = await sql`
      WITH finalized AS (
        SELECT COALESCE(SUM(megy_amount), 0)::numeric AS finalized
        FROM claim_snapshots
        WHERE wallet_address = ${wallet_address}
          AND phase_id = ${phase_id}
      ),
      claimed AS (
        SELECT COALESCE(SUM(claim_amount), 0)::numeric AS claimed
        FROM claims
        WHERE wallet_address = ${wallet_address}
          AND phase_id = ${phase_id}
      ),
      can AS (
        SELECT
          (finalized.finalized) AS finalized,
          (claimed.claimed) AS claimed,
          GREATEST(finalized.finalized - claimed.claimed, 0)::numeric AS claimable
        FROM finalized, claimed
      ),
      ins AS (
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
        SELECT
          ${phase_id},
          ${wallet_address},
          ${claim_amount}::numeric,
          ${destination},
          ${tx_signature},
          ${sol_fee_paid},
          ${sol_fee_amount}::numeric,
          NOW()
        FROM can
        WHERE ${claim_amount}::numeric <= can.claimable
        ON CONFLICT (phase_id, tx_signature) DO NOTHING
        RETURNING 1
      )
      SELECT
        (SELECT finalized FROM can)::text AS finalized,
        (SELECT claimed FROM can)::text AS claimed,
        (SELECT claimable FROM can)::text AS claimable,
        (SELECT COUNT(*) FROM ins)::int AS inserted
    `;

    const r = (rows as any[])[0] ?? {};
    const finalized = Number(r.finalized ?? 0);
    const claimed = Number(r.claimed ?? 0);
    const claimable = Number(r.claimable ?? 0);
    const inserted = Number(r.inserted ?? 0);

    if (inserted === 0) {
      // Either deduped OR exceeded available
      // If tx already exists, treat as success (dedupe)
      const dedupe = await sql`
        SELECT 1 FROM claims WHERE phase_id = ${phase_id} AND tx_signature = ${tx_signature} LIMIT 1
      `;
      if ((dedupe as any[]).length > 0) {
        return NextResponse.json({ success: true, deduped: true });
      }
      return NextResponse.json(
        { success: false, error: 'CLAIM_EXCEEDS_AVAILABLE', finalized, claimed, claimable },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      phase_id,
      finalized,
      claimed_after: claimed + claim_amount,
      claimable_after: Math.max(claimable - claim_amount, 0),
    });
  } catch (error: any) {
    console.error('[claim/record] error:', error);
    if (error?.status) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: error?.message || 'Internal error' }, { status: 500 });
  }
}
