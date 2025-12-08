// app/api/coincarnation/record/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { generateReferralCode } from '@/app/api/utils/generateReferralCode';

import {
  ensureFirstSeenRegistry,
  computeStatusDecision,
  getStatusRow,
  type TokenStatus,
} from '@/app/api/_lib/registry';

import { requireAppEnabled } from '@/app/api/_lib/feature-flags';

import {
  awardUsdPoints,
  awardDeadcoinFirst,
  awardReferralSignup,
} from '@/app/api/_lib/corepoints';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

// RPC URL (öncelik)
const SOLANA_RPC_URL =
  process.env.ALCHEMY_SOLANA_RPC ||        // 🔹 1. tercih: Alchemy
  process.env.SOLANA_RPC_URL ||            // opsiyonel genel endpoint
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||// public fallback
  'https://api.mainnet-beta.solana.com';   // en son Solana default

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Confirm kontrolünü devre dışı bırakmak istersen: DISABLE_CONFIRM=true
const DISABLE_CONFIRM =
  String(process.env.DISABLE_CONFIRM || '').toLowerCase() === 'true';

function toNum(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/* ---------- Basit JSON-RPC helper ---------- */
async function rpc(method: string, params: any[]) {
  const r = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return r.json();
}

/* ---------- Tek seferlik status okuma ---------- */
async function isSolanaTxConfirmedOnce(signature: string): Promise<boolean> {
  const j = await rpc('getSignatureStatuses', [
    [signature],
    { searchTransactionHistory: true },
  ]);
  const status = j?.result?.value?.[0] || null;
  if (!status) return false;
  if (status.err !== null) return false;
  const cs = status.confirmationStatus as string | undefined;
  return cs === 'confirmed' || cs === 'finalized';
}

/* ----------  Polling ile confirmation bekleme  ---------- */
async function waitForSolanaConfirm(
  signature: string,
  maxMs = 15000,
  intervalMs = 1200,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const ok = await isSolanaTxConfirmedOnce(signature);
      if (ok) return true;
    } catch (e) {
      console.warn(
        '⚠️ getSignatureStatuses polling failed:',
        (e as any)?.message || e,
      );
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return false;
}

export async function POST(req: NextRequest) {
  console.log('✅ /api/coincarnation/record called');
  await requireAppEnabled();

  try {
    const idemHeader = req.headers.get('Idempotency-Key') || null;
    const body = await req.json();
    console.log('📥 incoming body:', JSON.stringify(body));

    // body'den gelen ham alanlar
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
      referral_code: referralFromBody, // alias

      asset_kind, // opsiyonel: 'sol' | 'spl'
    } = body ?? {};

    // 🔹 Referral kodunu daha akıllı topla:
    // 1) body.referral_code
    // 2) body.ref
    // 3) Referer header içindeki ?r=
    let inboundReferral: string | null =
      typeof referralFromBody === 'string' && referralFromBody.trim()
        ? referralFromBody.trim()
        : null;

    if (!inboundReferral && typeof (body as any)?.ref === 'string') {
      const r2 = (body as any).ref.trim();
      if (r2) inboundReferral = r2;
    }

    if (!inboundReferral) {
      const refererHeader = req.headers.get('referer');
      if (refererHeader) {
        try {
          const u = new URL(refererHeader);
          const rParam = u.searchParams.get('r');
          if (rParam && rParam.trim()) {
            inboundReferral = rParam.trim();
          }
        } catch {
          // parse edemezsek sessiz geç
        }
      }
    }

    // ——— Temel alanlar ———
    if (!wallet_address || !token_symbol) {
      return NextResponse.json(
        {
          success: false,
          error: 'wallet_address and token_symbol are required',
        },
        { status: 400 },
      );
    }

    const txHashOrSig =
      (tx_hash && String(tx_hash).trim()) ||
      (transaction_signature && String(transaction_signature).trim()) ||
      null;

    if (!txHashOrSig) {
      return NextResponse.json(
        {
          success: false,
          error:
            'transaction_signature (Solana) or tx_hash (EVM) is required',
        },
        { status: 400 },
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
      isSolSymbol && (!token_contract || token_contract === WSOL_MINT)
        ? 'sol'
        : 'spl';
    const assetKindFinal: 'sol' | 'spl' =
      asset_kind === 'sol' || asset_kind === 'spl'
        ? asset_kind
        : derivedKind;

    // ——— On-chain confirm (polling ile ZORUNLU) ———
    if (
      !DISABLE_CONFIRM &&
      networkNorm === 'solana' &&
      transaction_signature
    ) {
      console.log(
        '⏳ waiting for on-chain confirmation of',
        transaction_signature,
      );
      const ok = await waitForSolanaConfirm(transaction_signature);
      if (!ok) {
        console.warn(
          '❌ Tx NOT confirmed on-chain within timeout, aborting record:',
          transaction_signature,
        );
        return NextResponse.json(
          {
            success: false,
            error:
              'Transaction is not confirmed on Solana yet. Record aborted.',
          },
          { status: 409 },
        );
      }
      console.log('✅ Tx confirmed on-chain:', transaction_signature);
    }

    // ——— Redlist/Blacklist + statü okuma ———
    const hasMint = Boolean(token_contract && token_contract !== 'SOL');
    let tokenStatus: TokenStatus | null = null;
    let isDeadcoinByStatus = false;

    if (hasMint) {
      try {
        const reg = await getStatusRow(token_contract!);
        tokenStatus = (reg?.status ?? null) as TokenStatus | null;

        if (tokenStatus === 'blacklist') {
          return NextResponse.json(
            { success: false, error: 'This token is blacklisted.' },
            { status: 403 },
          );
        }
        if (tokenStatus === 'redlist') {
          return NextResponse.json(
            { success: false, error: 'This token is redlisted.' },
            { status: 403 },
          );
        }

        // 🟤 vote / admin kararıyla deadcoin olmuş token
        if (tokenStatus === 'deadcoin') {
          isDeadcoinByStatus = true;
        }
      } catch (e) {
        console.warn(
          '⚠️ registry check failed, continuing:',
          (e as any)?.message || e,
        );
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
          const existingId = dup[0].id as number;
          const stableTxId = String(existingId);

          return NextResponse.json({
            success: true,
            duplicate: true,
            id: existingId,
            via: 'tx_hash/transaction_signature',
            tx_id: stableTxId,
            txId: stableTxId,
          });
        }
      }

      if (idemKey) {
        const dup2 = await sql`
          SELECT id FROM contributions
          WHERE idempotency_key = ${idemKey}
          LIMIT 1
        `;
        if (dup2.length > 0) {
          const existingId = dup2[0].id as number;
          const stableTxId = String(existingId);

          return NextResponse.json({
            success: true,
            duplicate: true,
            id: existingId,
            via: 'idempotency_key',
            tx_id: stableTxId,
            txId: stableTxId,
          });
        }
      }
    } catch (e) {
      console.warn(
        '⚠️ idempotency check failed, continuing:',
        (e as any)?.message || e,
      );
    }

    // ——— Participants ———
    let userReferralCode = '';
    let referrerWallet: string | null = null;
    let isNewParticipant = false;

    try {
      const existing = await sql`
        SELECT referral_code, referrer_wallet
        FROM participants
        WHERE wallet_address = ${wallet_address}
          AND network        = ${networkNorm}
        LIMIT 1
      `;

      if (existing.length === 0) {
        isNewParticipant = true;

        // inboundReferral varsa referrer wallet'ı bul
        if (inboundReferral) {
          const ref = await sql`
            SELECT wallet_address
            FROM participants
            WHERE referral_code = ${inboundReferral}
            LIMIT 1
          `;
          if (
            ref.length > 0 &&
            ref[0].wallet_address !== wallet_address
          ) {
            referrerWallet = ref[0].wallet_address;
          }
        }

        // Yeni kullanıcının kendi referral kodu
        userReferralCode = generateReferralCode();

        await sql`
          INSERT INTO participants (
            wallet_address,
            network,
            referral_code,
            referrer_wallet
          )
          VALUES (
            ${wallet_address},
            ${networkNorm},
            ${userReferralCode},
            ${referrerWallet}
          )
          ON CONFLICT (wallet_address, network) DO NOTHING
        `;
      } else {
        userReferralCode =
          existing[0].referral_code || generateReferralCode();
        referrerWallet = existing[0].referrer_wallet;

        // Eski kayıtta referral_code yoksa doldur
        if (!existing[0].referral_code) {
          await sql`
            UPDATE participants
               SET referral_code = ${userReferralCode}
             WHERE wallet_address = ${wallet_address}
               AND network        = ${networkNorm}
          `;
        }
      }

      // Emniyet: her durumda boş kalmasın
      if (!userReferralCode) {
        userReferralCode = generateReferralCode();
        await sql`
          UPDATE participants
             SET referral_code = ${userReferralCode}
           WHERE wallet_address = ${wallet_address}
             AND network        = ${networkNorm}
        `;
      }
    } catch (e) {
      console.error(
        '❌ participants upsert failed:',
        (e as any)?.message || e,
      );
      return NextResponse.json(
        { success: false, error: 'participants upsert failed' },
        { status: 500 },
      );
    }

    // 🔥 Referral CP: sadece YENİ gelen cüzdan için, ve referrer varsa
    if (isNewParticipant && referrerWallet) {
      try {
        await awardReferralSignup({
          referrer: referrerWallet,
          referee: wallet_address,
        });
      } catch (e) {
        console.warn(
          '⚠️ referral_signup award failed:',
          (e as any)?.message || e,
        );
      }
    }

    // ——— Contributions için referral metadata ———
    const contribReferralCode: string | null =
      userReferralCode || null;
    const contribReferrerWallet: string | null =
      referrerWallet;

    // ——— CONTRIBUTIONS: ŞEMA TOLERANSLI INSERT ———
    let hasAssetKind = false;
    try {
      const cols = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'contributions'
      `;
      hasAssetKind = cols.some(
        (r: any) => r.column_name === 'asset_kind',
      );
    } catch (e) {
      console.warn(
        '⚠️ failed to inspect schema, assuming no asset_kind:',
        (e as any)?.message || e,
      );
      hasAssetKind = false;
    }

    let insertedId: number | null = null;

    try {
      if (hasAssetKind) {
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
            ${contribReferralCode},
            ${contribReferrerWallet},
            ${assetKindFinal}
          )
          ON CONFLICT (network, tx_hash) DO NOTHING
          RETURNING id;
        `;
        insertedId = insertResult?.[0]?.id ?? null;
      } else {
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
            ${contribReferralCode},
            ${contribReferrerWallet}
          )
          ON CONFLICT (network, tx_hash) DO NOTHING
          RETURNING id;
        `;
        insertedId = insertResult?.[0]?.id ?? null;
      }

      console.log('📝 contribution inserted id:', insertedId);
    } catch (e) {
      console.error(
        '❌ contribution insert failed:',
        (e as any)?.message || e,
      );
      return NextResponse.json(
        {
          success: false,
          error: 'contribution insert failed',
          detail: String((e as any)?.message || e),
        },
        { status: 500 },
      );
    }

    // ——— CorePoint: USD + Deadcoin (corepoint_events tablosu) ———
    const stableTxId = txHashOrSig ? String(txHashOrSig) : null;

    // 🔍 Deadcoin tespiti:
    //  - fiyat tabanlı: usd_value === 0 && mint varsa
    //  - statü tabanlı: token_registry.status === 'deadcoin'
    const isDeadcoinByPrice = usdValueNum === 0 && !!token_contract;
    const isDeadcoin = isDeadcoinByPrice || isDeadcoinByStatus;

    try {
      // 💵 USD katkısı → her durumda CP (deadcoin bile olsa katkı sayıyoruz)
      if (usdValueNum > 0 && stableTxId) {
        await awardUsdPoints({
          wallet: wallet_address,
          usdValue: usdValueNum,
          txId: stableTxId,
        });
      }

      // 💀 Deadcoin bonusu:
      //  - fiyat 0 olanlar
      //  - VEYA admin/vote ile deadcoin statüsüne çekilmiş olanlar
      if (isDeadcoin && token_contract) {
        await awardDeadcoinFirst({
          wallet: wallet_address,
          tokenContract: token_contract,
          txId: stableTxId,
        });
      }
    } catch (e) {
      console.warn(
        '⚠️ CorePoint award (usd/deadcoin) failed:',
        (e as any)?.message || e,
      );
    }

    // ——— Kullanıcı numarası ———
    let number = 0;
    try {
      const result = await sql`
        SELECT id
        FROM participants
        WHERE wallet_address = ${wallet_address}
          AND network = ${networkNorm}
      `;
      number = result[0]?.id ?? 0;
    } catch {}

    return NextResponse.json({
      success: true,
      id: insertedId,
      number,
      referral_code: userReferralCode,

      transaction_signature: txHashOrSig,
      tx_id: stableTxId,
      txId: stableTxId,

      message: '✅ Coincarnation recorded',
    });
  } catch (error: any) {
    console.error('❌ Record API Error:', error?.message || error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Unknown server error',
      },
      { status },
    );
  }
}
