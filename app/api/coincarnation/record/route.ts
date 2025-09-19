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

// 🔽 Feature flags (global kill-switch)
import { requireAppEnabled } from '@/app/api/_lib/feature-flags';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

function toNum(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function POST(req: NextRequest) {
  console.log('✅ /api/coincarnation/record API called');
  await requireAppEnabled();

  try {
    const idemHeader = req.headers.get('Idempotency-Key') || null;
    const body = await req.json();

    const {
      wallet_address,
      token_symbol,
      token_contract,
      token_amount,
      usd_value,

      // Solana / EVM tx fields
      transaction_signature, // Solana
      tx_hash,               // EVM
      tx_block,              // optional block number

      // Optional idempotency
      idempotency_key,

      // Misc
      network,
      user_agent,
      referral_code,
    } = body ?? {};

    const timestamp = new Date().toISOString();

    if (!wallet_address || !token_symbol) {
      return NextResponse.json(
        { success: false, error: 'wallet_address and token_symbol are required' },
        { status: 400 }
      );
    }

    const tokenAmountNum = toNum(token_amount, 0);
    const usdValueNum = toNum(usd_value, 0);
    const networkNorm = String(network || 'solana');
    const idemKey = (idempotency_key || idemHeader || '').trim() || null;

    // normalize tx
    const txHashOrSig =
      (tx_hash && String(tx_hash).trim()) ||
      (transaction_signature && String(transaction_signature).trim()) ||
      null;

    // 1) Mantıksal koruma: SOL zero USD engeli
    if (usdValueNum === 0 && String(token_symbol).toUpperCase() === 'SOL') {
      console.error('❌ FATAL: SOL token reported with 0 USD value. Rejecting.');
      return NextResponse.json(
        { success: false, error: 'SOL cannot have zero USD value. Try again later.' },
        { status: 400 }
      );
    }

    // 2) Redlist/Blacklist guard (mint varsa kontrol)
    const hasMint = Boolean(token_contract && token_contract !== 'SOL');
    if (hasMint) {
      const reg = await getStatusRow(token_contract!);
      if (reg?.status === 'blacklist') {
        return NextResponse.json(
          { success: false, error: 'This token is blacklisted and cannot be coincarnated.' },
          { status: 403 }
        );
      }
      if (reg?.status === 'redlist') {
        return NextResponse.json(
          { success: false, error: 'This token is redlisted and cannot be coincarnated after its redlist date.' },
          { status: 403 }
        );
      }
    }

    // 3) Statü kararı (deadcoin akışı dahil)
    let initialDecision:
      | { status: TokenStatus; voteSuggested?: boolean; reason?: string; metrics?: { vol: number; liq: number } }
      | null = null;

    if (hasMint) {
      if (usdValueNum === 0) {
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

    // 4) Idempotency pre-checks
    // 4.a: Eğer aynı (network, tx_hash|transaction_signature) varsa duplicate
    if (txHashOrSig) {
      const dup = await sql`
        SELECT id FROM contributions
        WHERE network = ${networkNorm}
          AND (tx_hash = ${txHashOrSig} OR transaction_signature = ${txHashOrSig})
        LIMIT 1
      `;
      if (dup.length > 0) {
        return NextResponse.json({ success: true, duplicate: true, id: dup[0].id, via: 'tx_hash/transaction_signature' });
      }
    }

    // 4.b: Eğer aynı idempotency_key varsa:
    if (idemKey) {
      const dup2 = await sql`
        SELECT id, tx_hash FROM contributions WHERE idempotency_key = ${idemKey} LIMIT 1
      `;
      if (dup2.length > 0) {
        // Niyet kaydı önceden açılmış, şimdi tx gelmişse → UPDATE ile tamamla
        if (txHashOrSig && !dup2[0].tx_hash) {
          const updated = await sql`
            UPDATE contributions
               SET tx_hash = ${txHashOrSig},
                   transaction_signature = COALESCE(transaction_signature, ${txHashOrSig}),
                   tx_block = ${tx_block ?? null}
             WHERE id = ${dup2[0].id}
             RETURNING id
          `;
          return NextResponse.json({ success: true, updated: true, id: updated[0].id, via: 'idempotency_key' });
        }
        // Aksi halde duplicate
        return NextResponse.json({ success: true, duplicate: true, id: dup2[0].id, via: 'idempotency_key' });
      }
    }

    // 5) Participants (network scoped) + referral
    const existing = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet_address} AND network = ${networkNorm}
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
        INSERT INTO participants (wallet_address, network, referral_code, referrer_wallet)
        VALUES (${wallet_address}, ${networkNorm}, ${userReferralCode}, ${referrerWallet})
        ON CONFLICT (wallet_address, network) DO NOTHING
      `;
    } else {
      userReferralCode = existing[0].referral_code;
      if (!userReferralCode) {
        userReferralCode = generateReferralCode();
        await sql`
          UPDATE participants
             SET referral_code = ${userReferralCode}
           WHERE wallet_address = ${wallet_address} AND network = ${networkNorm}
        `;
      }
    }

    // 6) Contribution INSERT (niyet kaydı veya tam kayıt)
    let insertedId: number | null = null;
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
          tx_hash,
          tx_block,
          idempotency_key,
          user_agent,
          timestamp,
          referral_code,
          referrer_wallet
        ) VALUES (
          ${wallet_address},
          ${token_symbol},
          ${token_contract},
          ${networkNorm},
          ${tokenAmountNum},
          ${usdValueNum},
          ${transaction_signature || txHashOrSig || null},
          ${tx_hash || txHashOrSig || null},
          ${tx_block ?? null},
          ${idemKey},
          ${user_agent || ''},
          ${timestamp},
          ${userReferralCode},
          ${referrerWallet}
        )
        ON CONFLICT (network, tx_hash) DO NOTHING
        RETURNING id;
      `;
      if (insertResult.length > 0) {
        insertedId = insertResult[0].id as number;
      }
    } catch (insertError: any) {
      console.error('❌ Contribution INSERT failed:', insertError);
    }

    // Conflict olduysa mevcut kaydı bul (tx veya idem üzerinden)
    if (!insertedId && txHashOrSig) {
      const ex = await sql`
        SELECT id FROM contributions WHERE network=${networkNorm} AND tx_hash=${tx_hash || txHashOrSig} LIMIT 1
      `;
      if (ex.length > 0) {
        return NextResponse.json({ success: true, duplicate: true, id: ex[0].id, via: 'tx_hash' });
      }
    }
    if (!insertedId && idemKey) {
      const ex2 = await sql`
        SELECT id FROM contributions WHERE idempotency_key=${idemKey} LIMIT 1
      `;
      if (ex2.length > 0) {
        return NextResponse.json({ success: true, duplicate: true, id: ex2[0].id, via: 'idempotency_key' });
      }
    }

    // 7) Registry ilk kaydı (yalnızca mint varsa)
    let registryCreated = false;
    if (hasMint) {
      const res = await ensureFirstSeenRegistry(token_contract!, {
        suggestedStatus: initialStatus,
        actorWallet: wallet_address,
        reason: 'first_coincarnation',
        meta: {
          from: 'record_api',
          network: networkNorm,
          tx: txHashOrSig,
          decisionReason: initialDecision?.reason ?? null,
          vol: decisionMetrics?.vol ?? null,
          liq: decisionMetrics?.liq ?? null,
          voteSuggested,
        }
      });
      registryCreated = !!res?.created;
    }

    // 8) Kullanıcı numarası
    const result = await sql`
      SELECT id FROM participants WHERE wallet_address = ${wallet_address} AND network = ${networkNorm}
    `;
    const number = result[0]?.id ?? 0;

    return NextResponse.json({
      success: true,
      id: insertedId || null,
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
    console.error('❌ Record API Error:', error?.message || error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { success: false, error: error?.message || 'Unknown server error' },
      { status }
    );
  }
}
