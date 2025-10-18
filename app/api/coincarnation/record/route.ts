export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

// RPC URL (öncelik)
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC ||
  process.env.ALCHEMY_SOLANA_RPC ||
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

// Hazine adresi (server > public fallbacks)
const DEST_SOLANA =
  process.env.DEST_SOLANA ||
  process.env.NEXT_PUBLIC_DEST_SOLANA ||
  process.env.NEXT_PUBLIC_DEST_SOL ||
  '';

// Confirm kontrolünü devre dışı bırakmak istersen: DISABLE_CONFIRM=true
const DISABLE_CONFIRM = String(process.env.DISABLE_CONFIRM || '').toLowerCase() === 'true';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

function toNum(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function rpc(method: string, params: any[]) {
  const r = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return r.json();
}

async function isSolanaTxConfirmed(signature: string) {
  try {
    const j = await rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
    const status = j?.result?.value?.[0] || null;
    if (!status) return false;
    if (status.err !== null) return false;
    const cs = status.confirmationStatus as string | undefined;
    return cs === 'confirmed' || cs === 'finalized';
  } catch (e) {
    console.warn('⚠️ getSignatureStatuses failed:', (e as any)?.message || e);
    return true; // ağ hatası → engelleme
  }
}

export async function POST(req: NextRequest) {
  console.log('✅ /api/coincarnation/record called');
  await requireAppEnabled();

  try {
    const idemHeader = req.headers.get('Idempotency-Key') || null;
    const body = await req.json();
    console.log('📥 incoming body:', JSON.stringify(body));

    const {
      wallet_address,
      token_symbol,
      token_contract,
      token_amount,
      usd_value,

      transaction_signature,
      tx_hash,
      tx_block,

      idempotency_key,
      network,
      user_agent,
      referral_code,

      asset_kind, // opsiyonel: 'sol' | 'spl'
    } = body ?? {};

    // ——— Temel alanlar ———
    if (!wallet_address || !token_symbol) {
      return NextResponse.json(
        { success: false, error: 'wallet_address and token_symbol are required' },
        { status: 400 }
      );
    }

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

    const timestamp = new Date().toISOString();
    const tokenAmountNum = toNum(token_amount, 0);
    const usdValueNum = toNum(usd_value, 0);
    const networkNorm = String(network || 'solana');
    const idemKey = (idempotency_key || idemHeader || '').trim() || null;

    // ——— Varlık türünü türet ———
    const isSolSymbol = String(token_symbol).toUpperCase() === 'SOL';
    const derivedKind: 'sol' | 'spl' =
      isSolSymbol && (!token_contract || token_contract === WSOL_MINT) ? 'sol' : 'spl';
    const assetKindFinal: 'sol' | 'spl' =
      asset_kind === 'sol' || asset_kind === 'spl' ? asset_kind : derivedKind;

    // ——— On-chain confirm (gevşek) ———
    if (!DISABLE_CONFIRM && networkNorm === 'solana' && transaction_signature) {
      const ok = await isSolanaTxConfirmed(transaction_signature);
      if (!ok) {
        console.warn('⚠️ tx not confirmed yet, proceeding anyway:', transaction_signature);
      }
    }

    // ——— Redlist/Blacklist (best effort) ———
    const hasMint = Boolean(token_contract && token_contract !== 'SOL');
    if (hasMint) {
      try {
        const reg = await getStatusRow(token_contract!);
        if (reg?.status === 'blacklist') {
          return NextResponse.json({ success: false, error: 'This token is blacklisted.' }, { status: 403 });
        }
        if (reg?.status === 'redlist') {
          return NextResponse.json({ success: false, error: 'This token is redlisted.' }, { status: 403 });
        }
      } catch (e) {
        console.warn('⚠️ registry check failed, continuing:', (e as any)?.message || e);
      }
    }

    // ——— Idempotency ———
    try {
      if (txHashOrSig) {
        const dup = await sql`
          SELECT id FROM contributions
          WHERE network = ${networkNorm}
            AND (tx_hash = ${txHashOrSig} OR transaction_signature = ${txHashOrSig})
          LIMIT 1
        `;
        if (dup.length > 0) {
          return NextResponse.json({
            success: true,
            duplicate: true,
            id: dup[0].id,
            via: 'tx_hash/transaction_signature'
          });
        }
      }
      if (idemKey) {
        const dup2 = await sql`
          SELECT id FROM contributions WHERE idempotency_key = ${idemKey} LIMIT 1
        `;
        if (dup2.length > 0) {
          return NextResponse.json({
            success: true,
            duplicate: true,
            id: dup2[0].id,
            via: 'idempotency_key'
          });
        }
      }
    } catch (e) {
      console.warn('⚠️ idempotency check failed, continuing:', (e as any)?.message || e);
    }

    // ——— Participants ———
    let userReferralCode = '';
    let referrerWallet: string | null = null;
    try {
      const existing = await sql`
        SELECT * FROM participants
        WHERE wallet_address = ${wallet_address} AND network = ${networkNorm}
      `;
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
            UPDATE participants
               SET referral_code = ${userReferralCode}
             WHERE wallet_address = ${wallet_address} AND network = ${networkNorm}
          `;
        }
      }
    } catch (e) {
      console.error('❌ participants upsert failed:', (e as any)?.message || e);
      return NextResponse.json({ success: false, error: 'participants upsert failed' }, { status: 500 });
    }

    // ——— CONTRIBUTIONS: ŞEMA TOLERANSLI INSERT ———
    // asset_kind kolonu DB’de var mı kontrolü
    let hasAssetKind = false;
    try {
      const cols = await sql`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_name = 'contributions'
      `;
      hasAssetKind = cols.some((r: any) => r.column_name === 'asset_kind');
    } catch (e) {
      console.warn('⚠️ failed to inspect schema, assuming no asset_kind:', (e as any)?.message || e);
      hasAssetKind = false;
    }

    let insertedId: number | null = null;
    try {
      if (hasAssetKind) {
        // Yeni şema (asset_kind var)
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
            referrer_wallet,
            asset_kind
          ) VALUES (
            ${wallet_address},
            ${token_symbol},
            ${token_contract ?? null},
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
            ${referrerWallet},
            ${assetKindFinal}
          )
          ON CONFLICT (network, tx_hash) DO NOTHING
          RETURNING id;
        `;
        insertedId = insertResult?.[0]?.id ?? null;
      } else {
        // Eski şema (asset_kind yok)
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
            ${token_contract ?? null},
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
        insertedId = insertResult?.[0]?.id ?? null;
      }
      console.log('📝 contribution inserted id:', insertedId);
    } catch (e) {
      console.error('❌ contribution insert failed:', (e as any)?.message || e);
      // Hatanın gövdesini açıkça döndürelim ki Network tab’ında net görünsün
      return NextResponse.json(
        { success: false, error: 'contribution insert failed', detail: String((e as any)?.message || e) },
        { status: 500 }
      );
    }

    // ——— Registry (best effort) ———
    if (hasMint) {
      try {
        const initialDecision =
          usdValueNum === 0
            ? { status: 'deadcoin' as TokenStatus, voteSuggested: false, reason: 'tx_usd_zero' }
            : await computeStatusDecision(token_contract!);
        await ensureFirstSeenRegistry(token_contract!, {
          suggestedStatus: (initialDecision?.status ?? 'healthy') as TokenStatus,
          actorWallet: wallet_address,
          reason: 'first_coincarnation',
          meta: { from: 'record_api', network: networkNorm, tx: txHashOrSig },
        });
      } catch (e) {
        console.warn('⚠️ registry ensure failed:', (e as any)?.message || e);
      }
    }

    // ——— Kullanıcı numarası ———
    let number = 0;
    try {
      const result = await sql`
        SELECT id FROM participants
        WHERE wallet_address = ${wallet_address} AND network = ${networkNorm}
      `;
      number = result[0]?.id ?? 0;
    } catch {}

    return NextResponse.json({
      success: true,
      id: insertedId,
      number,
      message: '✅ Coincarnation recorded',
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
