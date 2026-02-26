// app/api/coincarnation/record/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { allocateQueueFIFO } from '@/app/api/_lib/phases/allocator';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { generateReferralCode } from '@/app/api/utils/generateReferralCode';
import { advancePhases } from '@/app/api/_lib/phases/advance';
import { recomputeFromPhaseId } from '@/app/api/_lib/phases/recompute';

import {
  getStatusRow,
  type TokenStatus,
} from '@/app/api/_lib/registry';

import { requireAppEnabled } from '@/app/api/_lib/feature-flags';

import {
  awardUsdPoints,
  awardDeadcoinFirst,
  awardReferralSignup,
} from '@/app/api/_lib/corepoints';

// ✅ Destination wallet must exist (server-side guard)
// (env names you already use on Vercel)
const COINCARNE_DEST_WALLET =
  process.env.DEST_SOLANA ||
  process.env.NEXT_PUBLIC_DEST_SOL ||
  process.env.COINCARNE_DEST_WALLET ||
  process.env.NEXT_PUBLIC_COINCARNE_DEST_WALLET ||
  '';

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

function normalizeTokenContractForDb(p: {
  token_symbol: unknown;
  token_contract: unknown;
}): string | null {
  const sym = String(p.token_symbol || '').trim().toUpperCase();
  const raw = String(p.token_contract || '').trim();

  // SOL: DB'de NULL yok -> WSOL mint ile temsil ediyoruz
  if (sym === 'SOL') return WSOL_MINT;

  // SPL: mint zorunlu
  if (!raw) return null;

  // geçmişte yanlışlıkla "SOL" string'i yazıldıysa düzelt
  if (raw.toUpperCase() === 'SOL') return WSOL_MINT;

  return raw;
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

  let adv: Awaited<ReturnType<typeof advancePhases>> | null = null;
  let recompute: Awaited<ReturnType<typeof recomputeFromPhaseId>> | null = null;

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

    const networkNorm = String(network || 'solana').toLowerCase().trim();

    // ✅ SOLANA: transaction_signature zorunlu
    if (networkNorm === 'solana') {
      const sig = (transaction_signature && String(transaction_signature).trim()) || '';

      if (!sig) {
        return NextResponse.json(
          { success: false, error: 'MISSING_TRANSACTION_SIGNATURE' },
          { status: 400 }
        );
      }

      // ✅ Solana’da tx_hash kabul etmeyelim (yanlış data gelirse DB’ye girmesin)
      if (tx_hash && String(tx_hash).trim()) {
        return NextResponse.json(
          { success: false, error: 'TX_HASH_NOT_ALLOWED_ON_SOLANA' },
          { status: 400 }
        );
      }

      // (opsiyonel) Signature format sanity check (çok sıkı değil)
      if (sig.length < 60) {
        return NextResponse.json(
          { success: false, error: 'INVALID_TRANSACTION_SIGNATURE' },
          { status: 400 }
        );
      }
    }

    // ✅ EVM (şimdilik yok ama ileride): tx_hash zorunlu
    if (networkNorm !== 'solana') {
      const hash = (tx_hash && String(tx_hash).trim()) || '';
      if (!hash) {
        return NextResponse.json(
          { success: false, error: 'MISSING_TX_HASH' },
          { status: 400 }
        );
      }
    }

    const txHashOrSig =
      networkNorm === 'solana'
        ? String(transaction_signature).trim()
        : (tx_hash && String(tx_hash).trim()) || null;

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

    const tokenAmountNum = toNum(token_amount, 0);
    const usdValueNum = toNum(usd_value, 0);
    const idemKey = (idempotency_key || idemHeader || '').trim() || null;

    // ✅ Guard: Solana record requires a destination wallet env
    if (networkNorm === 'solana' && !COINCARNE_DEST_WALLET) {
      return NextResponse.json(
        { success: false, error: 'MISSING_DEST_WALLET' },
        { status: 500 }
      );
    }

    // ✅ token_contract'ı DB için kesinleştir
    const tokenContractFinal = normalizeTokenContractForDb({ token_symbol, token_contract });

    // SPL için mint zorunlu (SOL zaten WSOL ile normalize olur)
    if (!tokenContractFinal) {
      return NextResponse.json(
        { success: false, error: 'token_contract (mint) is required for SPL tokens' },
        { status: 400 }
      );
    }

    // ——— Varlık türünü türet ———
    const isSolSymbol = String(token_symbol).toUpperCase() === 'SOL';
    const derivedKind: 'sol' | 'spl' =
      isSolSymbol && tokenContractFinal === WSOL_MINT ? 'sol' : 'spl';

    const assetKindFinal: 'sol' | 'spl' =
      asset_kind === 'sol' || asset_kind === 'spl' ? asset_kind : derivedKind;

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

    // ✅ SOL için registry yok: SOL'u DB'de WSOL_MINT ile temsil ediyoruz
    const hasMint = assetKindFinal === 'spl';

    let tokenStatus: TokenStatus | null = null;
    let isDeadcoinByStatus = false;

    if (hasMint) {
      try {
        const reg = await getStatusRow(tokenContractFinal);
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

        if (tokenStatus === 'deadcoin') {
          isDeadcoinByStatus = true;
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

    // ——— Phase allocation: ALWAYS queue, allocator will place FIFO ———
    const phaseIdForContribution: number | null = null;
    const allocPhaseNoForContribution: number | null = null;
    const allocStatusForContribution: string | null = 'unassigned';

    const sig =
      transaction_signature && String(transaction_signature).trim()
        ? String(transaction_signature).trim()
        : null;

    const hash =
      tx_hash && String(tx_hash).trim()
        ? String(tx_hash).trim()
        : null;

    console.log('🧾 tx ids resolved:', {
      sig,
      hash,
      networkNorm,
    });        

    // ——— CONTRIBUTIONS: INSERT (deterministic + safe) ———
    let insertedId: number | null = null;

    try {
      // IMPORTANT: conflict target must match a REAL unique index
      // - if hash exists => ON CONFLICT (network, tx_hash)
      // - else          => ON CONFLICT (network, transaction_signature)

      let insertResult: any;

      console.log(
        '⚙️ conflict mode:',
        hash ? 'hash (network, tx_hash)' : 'sig (network, transaction_signature)'
      );      

      if (hash) {
        insertResult = await sql`
          INSERT INTO contributions (
            wallet_address, token_symbol, token_contract, network,
            token_amount, usd_value,
            transaction_signature, tx_hash, tx_block,
            idempotency_key, user_agent, "timestamp",
            referral_code, referrer_wallet, asset_kind,
            phase_id, alloc_phase_no, alloc_status, alloc_updated_at
          ) VALUES (
            ${wallet_address}, ${token_symbol}, ${tokenContractFinal}, ${networkNorm},
            ${tokenAmountNum}, ${usdValueNum},
            ${sig}, ${hash}, ${tx_block ?? null},
            ${idemKey}, ${user_agent || ''}, NOW(),
            ${contribReferralCode}, ${contribReferrerWallet}, ${assetKindFinal},
            ${phaseIdForContribution}, ${allocPhaseNoForContribution}, ${allocStatusForContribution}, NOW()
          )
          ON CONFLICT (network, tx_hash) DO NOTHING
          RETURNING id;
        `;
      } else if (sig) {
        insertResult = await sql`
          INSERT INTO contributions (
            wallet_address, token_symbol, token_contract, network,
            token_amount, usd_value,
            transaction_signature, tx_hash, tx_block,
            idempotency_key, user_agent, "timestamp",
            referral_code, referrer_wallet, asset_kind,
            phase_id, alloc_phase_no, alloc_status, alloc_updated_at
          ) VALUES (
            ${wallet_address}, ${token_symbol}, ${tokenContractFinal}, ${networkNorm},
            ${tokenAmountNum}, ${usdValueNum},
            ${sig}, NULL, ${tx_block ?? null},
            ${idemKey}, ${user_agent || ''}, NOW(),
            ${contribReferralCode}, ${contribReferrerWallet}, ${assetKindFinal},
            ${phaseIdForContribution}, ${allocPhaseNoForContribution}, ${allocStatusForContribution}, NOW()
          )
          ON CONFLICT (network, transaction_signature) DO NOTHING
          RETURNING id;
        `;
      } else {
        return NextResponse.json(
          { success: false, error: 'MISSING_TX_ID' },
          { status: 400 }
        );
      }

      insertedId = insertResult?.[0]?.id != null ? Number(insertResult[0].id) : null;

      // If DO NOTHING happened, fetch existing id and treat as duplicate success
      if (!insertedId) {
        const exists = await sql`
          SELECT id
          FROM contributions
          WHERE network = ${networkNorm}
            AND (
              (${hash} IS NOT NULL AND tx_hash = ${hash})
              OR
              (${sig}  IS NOT NULL AND transaction_signature = ${sig})
            )
          LIMIT 1
        `;

        if (exists?.length) {
          const existingId = Number(exists[0].id);
          return NextResponse.json({
            success: true,
            duplicate: true,
            id: existingId,
            tx_id: String(existingId),
            txId: String(existingId),
          });
        }

        return NextResponse.json(
          { success: false, error: 'DB_INSERT_FAILED_NO_ROW' },
          { status: 500 }
        );
      }

      console.log('📝 contribution inserted id:', insertedId);
    } catch (e: any) {
      console.error('❌ contribution insert failed:', e?.message || e);
      return NextResponse.json(
        {
          success: false,
          error: 'contribution insert failed',
          detail: String(e?.message || e),
        },
        { status: 500 },
      );
    }

    let allocator: any = null;
    let allocatorError: string | null = null;

    try {
      allocator = await allocateQueueFIFO({ maxSteps: 20 });
    } catch (e: any) {
      allocatorError = String(e?.message || e);
      console.error('❌ allocator failed:', allocatorError, e);
    }
    // ---- phase automation: advance + recompute (after allocator) ----
    try {
      adv = await advancePhases();

      const fromId =
        (adv?.openedPhaseIds?.length ? adv.openedPhaseIds[0] : null) ??
        (adv?.activePhaseId ?? null);

      recompute = fromId ? await recomputeFromPhaseId(Number(fromId)) : null;
    } catch (e: any) {
      console.warn('⚠️ advance/recompute failed:', e?.message || e);
    }

    // ——— CorePoint: USD + Deadcoin (corepoint_events tablosu) ———
    const stableTxId = txHashOrSig ? String(txHashOrSig) : null;

    // 🔍 Deadcoin tespiti (local):
    //  - fiyat tabanlı: usd_value === 0 && mint varsa
    //  - statü tabanlı: token_registry.status === 'deadcoin'
    // sadece SPL için price=0 → deadcoin adayı; SOL'u burada deadcoin sayma
    const isDeadcoinByPrice = usdValueNum === 0 && tokenContractFinal !== WSOL_MINT;

    const isDeadcoin = isDeadcoinByPrice || isDeadcoinByStatus;

    // 🧠 Varsayılan reward bayrakları (fallback):
    // - usdValue > 0 ise CP verilebilir
    // - deadcoin ise deadcoin bonus verilebilir
    let rewardCorePoints: 'none' | 'standard' =
      usdValueNum > 0 ? 'standard' : 'none';
    let rewardDeadcoinBonus: 'none' | 'standard' =
      isDeadcoin ? 'standard' : 'none';

    // Eğer mint varsa, gerçek decision.reward bilgisini /api/status'tan çekelim.
    if (hasMint) {
      try {
        const statusUrl = new URL(
          `/api/status?mint=${encodeURIComponent(tokenContractFinal)}`,
          req.url,
        );
        const r = await fetch(statusUrl.toString(), { cache: 'no-store' });

        if (r.ok) {
          const js: any = await r.json();
          const rw = js?.decision?.reward;
          if (rw) {
            // computeEffectiveDecision içindeki reward haritasını kullan
            rewardCorePoints =
              rw.corePoints === 'standard' ? 'standard' : 'none';
            rewardDeadcoinBonus =
              rw.deadcoinBonus === 'standard' ? 'standard' : 'none';
          }
        } else {
          console.warn(
            '⚠️ /api/status responded non-OK for reward decision:',
            r.status,
          );
        }
      } catch (e) {
        console.warn(
          '⚠️ failed to fetch /api/status for reward decision:',
          (e as any)?.message || e,
        );
      }
    }

    try {
      // 💵 USD katkısı:
      //  - decision.reward.corePoints === 'standard' OLMALI
      //  - bu işleme ait usdValue > 0 OLMALI
      //  - txId olmalı (idempotent insert için)
      if (
        rewardCorePoints === 'standard' &&
        usdValueNum > 0 &&
        stableTxId
      ) {
        await awardUsdPoints({
          wallet: wallet_address,
          usdValue: usdValueNum,
          txId: stableTxId,
        });
      }

      // 💀 Deadcoin bonusu:
      //  - decision.reward.deadcoinBonus === 'standard' olmalı
      //  - token bu kayıt bağlamında deadcoin sayılıyor olmalı (isDeadcoin)
      //  - token_contract olmalı
      if (
        rewardDeadcoinBonus === 'standard' &&
        isDeadcoin &&
        hasMint
      ) {
        await awardDeadcoinFirst({
          wallet: wallet_address,
          tokenContract: tokenContractFinal,
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
      allocator,
      allocatorError,
      recompute: recompute ?? null,
      phaseAdvance: adv ?? null,

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
