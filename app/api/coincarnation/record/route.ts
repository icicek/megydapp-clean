// app/api/coincarnation/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { generateReferralCode } from '@/app/api/utils/generateReferralCode';

// Registry helpers
import {
  ensureFirstSeenRegistry,
  computeStatusDecision,
  getStatusRow,
  type TokenStatus
} from '@/app/api/_lib/registry';

// 🔽 Yeni: feature flags
import { requireAppEnabled } from '@/app/api/_lib/feature-flags';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  console.log('✅ /api/coincarnation/record API called');

  // 🛡️ Global kill-switch (yalnızca write uçlarında)
  await requireAppEnabled();

  try {
    const body = await req.json();
    const {
      wallet_address,
      token_symbol,
      token_contract,
      token_amount,
      usd_value,
      transaction_signature,
      network,
      user_agent,
      referral_code,
    } = body;

    const timestamp = new Date().toISOString();
    console.log('📦 Incoming data:', body);

    // 1) SOL için USD 0 engeli
    if (usd_value === 0 && token_symbol?.toUpperCase() === 'SOL') {
      console.error('❌ FATAL: SOL token reported with 0 USD value. Rejecting.');
      return NextResponse.json(
        { success: false, error: 'SOL cannot have zero USD value. Try again later.' },
        { status: 400 }
      );
    }

    // 2) Redlist/Blacklist guard
    const hasMint = Boolean(token_contract && token_contract !== 'SOL');
    if (hasMint) {
      const reg = await getStatusRow(token_contract!);
      if (reg?.status === 'blacklist') {
        return NextResponse.json(
          { success: false, error: 'This token is blacklisted and cannot be coincarnated.' },
          { status: 400 }
        );
      }
      if (reg?.status === 'redlist') {
        return NextResponse.json(
          { success: false, error: 'This token is redlisted and cannot be coincarnated after its redlist date.' },
          { status: 400 }
        );
      }
    }

    // 3) Statü kararı
    let initialDecision:
      | { status: TokenStatus; voteSuggested?: boolean; reason?: string; metrics?: { vol: number; liq: number } }
      | null = null;

    if (hasMint) {
      if (usd_value === 0) {
        initialDecision = {
          status: 'deadcoin',
          voteSuggested: false,
          reason: 'tx_usd_zero',
          metrics: { vol: 0, liq: 0 },
        };
      } else {
        initialDecision = await computeStatusDecision(token_contract!);
      }
    }

    const initialStatus: TokenStatus = (initialDecision?.status ?? 'healthy') as TokenStatus;
    const voteSuggested = Boolean(initialDecision?.voteSuggested);
    const decisionMetrics = initialDecision?.metrics ?? null;

    // Participants
    const existing = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet_address}
    `;

    let userReferralCode: string;
    let referrerWallet: string | null = null;

    if (existing.length === 0) {
      userReferralCode = generateReferralCode();

      if (referral_code) {
        const ref = await sql`
          SELECT wallet_address FROM participants WHERE referral_code = ${referral_code}
        `;
        if (ref.length > 0 && ref[0].wallet_address !== wallet_address) {
          referrerWallet = ref[0].wallet_address;
          console.log('🔁 referrerWallet matched:', referrerWallet);
        } else {
          console.log('⚠️ referral_code invalid or self-referencing');
        }
      }

      await sql`
        INSERT INTO participants (wallet_address, referral_code, referrer_wallet)
        VALUES (${wallet_address}, ${userReferralCode}, ${referrerWallet})
      `;
    } else {
      userReferralCode = existing[0].referral_code;
      if (!userReferralCode) {
        userReferralCode = generateReferralCode();
        await sql`
          UPDATE participants
          SET referral_code = ${userReferralCode}
          WHERE wallet_address = ${wallet_address}
        `;
      }
    }

    // Contribution kaydı
    try {
      const insertResult = await sql`
        INSERT INTO contributions (
          wallet_address,
          token_symbol,
          token_contract,
          network,
          token_amount,
          usd_value,
          transaction_signature,
          user_agent,
          timestamp,
          referral_code,
          referrer_wallet
        ) VALUES (
          ${wallet_address},
          ${token_symbol},
          ${token_contract},
          ${network},
          ${token_amount},
          ${usd_value},
          ${transaction_signature},
          ${user_agent},
          ${timestamp},
          ${userReferralCode},
          ${referrerWallet}
        ) RETURNING *;
      `;
      console.log('✅ INSERT result (with RETURNING):', insertResult);
    } catch (insertError: any) {
      console.error('❌ Contribution INSERT failed:', insertError);
    }

    // Registry ilk kaydı
    let registryCreated = false;
    if (hasMint) {
      const res = await ensureFirstSeenRegistry(token_contract!, {
        suggestedStatus: initialStatus,
        actorWallet: wallet_address,
        reason: 'first_coincarnation',
        meta: {
          from: 'record_api',
          network,
          tx: transaction_signature || null,
          decisionReason: initialDecision?.reason ?? null,
          vol: decisionMetrics?.vol ?? null,
          liq: decisionMetrics?.liq ?? null,
          voteSuggested,
        }
      });
      registryCreated = !!res?.created;
    }

    // Kullanıcı numarası
    const result = await sql`
      SELECT id FROM participants WHERE wallet_address = ${wallet_address}
    `;
    const number = result[0]?.id ?? 0;

    return NextResponse.json({
      success: true,
      number,
      referral_code: userReferralCode,
      message: '✅ Coincarnation recorded successfully',
      is_deadcoin: initialStatus === 'deadcoin',
      status: initialStatus,
      voteSuggested,
      metrics: decisionMetrics,
      registryCreated,
    });
  } catch (error: any) {
    console.error('❌ Record API Error:', error);
    if (error?.status) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error?.status) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { success: false, error: error?.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}
