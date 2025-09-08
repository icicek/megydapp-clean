// app/api/claim/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAppEnabled, requireClaimOpen } from '@/app/api/_lib/feature-flags';

type Body = {
  wallet_address?: string;
  claim_amount?: number;
  destination?: string;
  tx_signature?: string;
  sol_fee_paid?: number;
};

export async function POST(req: NextRequest) {
  // Server-side enforcement
  await requireAppEnabled();
  await requireClaimOpen();

  try {
    const body = (await req.json()) as Body;
    const {
      wallet_address,
      claim_amount,
      destination,
      tx_signature,
      sol_fee_paid,
    } = body ?? {};

    // Basic validation (schema-agnostic, kırmadan)
    if (!wallet_address || typeof wallet_address !== 'string') {
      return NextResponse.json({ success: false, error: 'wallet_address is required' }, { status: 400 });
    }
    if (!destination || typeof destination !== 'string') {
      return NextResponse.json({ success: false, error: 'destination is required' }, { status: 400 });
    }
    if (!tx_signature || typeof tx_signature !== 'string') {
      return NextResponse.json({ success: false, error: 'tx_signature is required' }, { status: 400 });
    }
    if (claim_amount == null || !Number.isFinite(Number(claim_amount)) || Number(claim_amount) < 0) {
      return NextResponse.json({ success: false, error: 'claim_amount must be a non-negative number' }, { status: 400 });
    }
    if (sol_fee_paid == null || !Number.isFinite(Number(sol_fee_paid)) || Number(sol_fee_paid) < 0) {
      return NextResponse.json({ success: false, error: 'sol_fee_paid must be a non-negative number' }, { status: 400 });
    }

    // Idempotency: aynı tx_signature ile kayıt varsa no-op (success:true)
    const existing = await sql`
      SELECT 1 FROM claims WHERE tx_signature = ${tx_signature} LIMIT 1
    `;
    if ((existing as any[]).length > 0) {
      return NextResponse.json({ success: true, deduped: true });
    }

    const timestamp = new Date().toISOString();

    await sql`
      INSERT INTO claims (
        wallet_address,
        claim_amount,
        destination,
        tx_signature,
        sol_fee_paid,
        timestamp
      )
      VALUES (
        ${wallet_address},
        ${Number(claim_amount)},
        ${destination},
        ${tx_signature},
        ${Number(sol_fee_paid)},
        ${timestamp}
      )
    `;

    // Not: participants.claimed güncellemesi yapmıyorum (partial-claim senaryosunu bozmayalım).
    // Eğer tek-seferlik claim istiyorsan burada UPDATE participants SET claimed=true ekleyebiliriz.

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[claim/record] error:', error);
    // Guard’lardan ya da ileride set edilecek status’lü hatalardan saygıyla dön
    if (error?.status) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: error?.message || 'Internal error' }, { status: 500 });
  }
}
