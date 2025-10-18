// app/api/coincarnation/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { generateReferralCode } from '@/app/api/utils/generateReferralCode';
import {
  ensureFirstSeenRegistry,
  computeStatusDecision,
  getStatusRow,
  type TokenStatus
} from '@/app/api/_lib/registry';
import { requireAppEnabled } from '@/app/api/_lib/feature-flags';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

// ✅ Solana RPC (onay kontrolü)
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

function toNum(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function isSolanaTxConfirmed(signature: string) {
  try {
    const r = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // getSignatureStatuses returns confirmations + err
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[signature], { searchTransactionHistory: true }],
      }),
      cache: 'no-store',
    });
    const j = await r.json();
    const status = j?.result?.value?.[0] || null;
    // err === null ve confirmationStatus confirmed/finalized yeterli
    if (!status) return false;
    if (status.err !== null) return false;
    const cs = status.confirmationStatus as string | undefined;
    return cs === 'confirmed' || cs === 'finalized';
  } catch {
    return false;
  }
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

      transaction_signature, // Solana
      tx_hash,               // EVM
      tx_block,

      idempotency_key,
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

    // ⛔ Artık imzasız/txsiz kayıt YOK
    const txHashOrSig =
      (tx_hash && String(tx_hash).trim()) ||
      (transaction_signature && String(transaction_signature).trim()) ||
      null;

    if (!txHashOrSig) {
      return NextResponse.json(
        { success: false, error: 'transaction_signature (Solana) or tx_hash (EVM) is required' },
        { status: 400 }
      );
    }

    const tokenAmountNum = toNum(token_amount, 0);
    const usdValueNum = toNum(usd_value, 0);
    const networkNorm = String(network || 'solana');
    const idemKey = (idempotency_key || idemHeader || '').trim() || null;

    // 🔒 On-chain doğrulama (Solana)
    if (networkNorm === 'solana' && transaction_signature) {
      const ok = await isSolanaTxConfirmed(transaction_signature);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: 'Transaction not confirmed on-chain' },
          { status: 400 }
        );
      }
    }

    // SOL’un 0 USD olması mantık hatası (ek koruma)
    if (usdValueNum === 0 && String(token_symbol).toUpperCase() === 'SOL') {
      console.error('❌ FATAL: SOL token reported with 0 USD value. Rejecting.');
      return NextResponse.json(
        { success: false, error: 'SOL cannot have zero USD value. Try again later.' },
        { status: 400 }
      );
    }

    // Redlist/Blacklist
    const hasMint = Boolean(token_contract && token_contract !== 'SOL' && token_contract !== WSOL_MINT);
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

    // Statü kararı
    let initialDecision:
      | { status: TokenStatus; voteSuggested?: boolean; reason?: string; metrics?: { vol: number; liq: number } }
      | null = null;

    if (hasMint) {
      if (usdValueNum === 0) {
        initialDecision = { status: 'deadcoin', voteSuggested: false, reason: 'tx_usd_zero', metrics: { vol: 0, liq: 0 } };
      } else {
        initialDecision = await computeStatusDecision(token_contract!);
      }
    }

    const initialStatus: TokenStatus = (initialDecision?.status ?? 'healthy') as TokenStatus;
    const voteSuggested = Boolean(initialDecision?.voteSuggested);
    const decisionMetrics = initialDecision?.metrics ?? null;

    // Idempotency (tx veya key)
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
    if (idemKey) {
      const dup2 = await sql`
        SELECT id FROM contributions WHERE idempotency_key = ${idemKey} LIMIT 1
      `;
      if (dup2.length > 0) {
        // Eğer ilkinde niyet kaydı kalsaydı burada güncelleyebilirdik; ama artık niyet kaydı yapmıyoruz.
        return NextResponse.json({ success: true, duplicate: true, id: dup2[0].id, via: 'idempotency_key' });
      }
    }

    // Participants + referral
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
        }
      }

      await sql`
        INSERT INTO participants (wallet_address, network, referral_code, referrer_wallet)
        VALUES (${wallet_address}, ${networkNorm}, ${userReferralCode}, ${referrerWallet})
        ON CONFLICT (wallet_address, network) DO NOTHING
      `;
    } else {
      userReferralCode = existing[0].referral_code || generateReferralCode();
      if (!existing[0].referral_code) {
        await sql`
          UPDATE participants SET referral_code = ${userReferralCode}
          WHERE wallet_address = ${wallet_address} AND network = ${networkNorm}
        `;
      }
    }

    // Contribution INSERT — artık SADECE on-chain onaydan sonra
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
        ${transaction_signature || null},
        ${tx_hash || null},
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

    const insertedId = insertResult?.[0]?.id ?? null;

    // Registry ilk kaydı
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

    // Kullanıcı numarası
    const result = await sql`
      SELECT id FROM participants WHERE wallet_address = ${wallet_address} AND network = ${networkNorm}
    `;
    const number = result[0]?.id ?? 0;

    return NextResponse.json({
      success: true,
      id: insertedId,
      number,
      referral_code: userReferralCode,
      message: '✅ Coincarnation recorded successfully (on-chain confirmed)',
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

// WSOL mint local copy (server’da da lazım)
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
