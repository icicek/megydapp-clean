// app/api/claim/preview/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import {
  getDistributionPoolNumber,
  getCoincarnationRateNumber,
} from '@/app/api/_lib/feature-flags';

// Sol için küçük helper
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

async function getLatestFinalizedPhaseId(): Promise<number | null> {
  const rows = await sql/* sql */`
    SELECT id
    FROM phases
    WHERE snapshot_taken_at IS NOT NULL
      AND LOWER(status_v2) = 'finalized'
    ORDER BY snapshot_taken_at DESC
    LIMIT 1
  `;
  const id = Number((rows[0] as any)?.id ?? 0);
  return id > 0 ? id : null;
}

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet')?.trim();
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Missing wallet' }, { status: 400 });
    }

    // phaseId opsiyonel: verilmezse en son finalized phase
    const phaseIdParam = req.nextUrl.searchParams.get('phaseId');
    let phaseId: number | null = null;
    if (phaseIdParam != null && phaseIdParam !== '') {
      const n = Number(phaseIdParam);
      phaseId = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (!phaseId) {
      phaseId = await getLatestFinalizedPhaseId();
    }

    // -----------------------------
    // FINALIZED truth (snapshot varsa)
    // -----------------------------
    let finalized: { phaseId: number; finalized: number; claimed: number; claimable: number } | null = null;

    if (phaseId) {
      const fin = await sql/* sql */`
        SELECT COALESCE(SUM(megy_amount),0)::float AS finalized
        FROM claim_snapshots
        WHERE wallet_address = ${wallet}
          AND phase_id = ${phaseId}
      `;
      const finalizedAmt = Number((fin[0] as any)?.finalized ?? 0);

      const cl = await sql/* sql */`
        SELECT COALESCE(SUM(claim_amount),0)::float AS claimed
        FROM claims
        WHERE wallet_address = ${wallet}
          AND phase_id = ${phaseId}
      `;
      const claimedAmt = Number((cl[0] as any)?.claimed ?? 0);

      const claimableAmt = Math.max(finalizedAmt - claimedAmt, 0);

      // Eğer snapshot’ta hiç kaydı yoksa finalized=null bırakmak daha doğru
      if (finalizedAmt > 0 || claimedAmt > 0) {
        finalized = {
          phaseId,
          finalized: finalizedAmt,
          claimed: claimedAmt,
          claimable: claimableAmt,
        };
      }
    }

    // -----------------------------
    // ESTIMATE (legacy) — katkılardan hesap
    // (UI kırılmasın diye aynen korunuyor)
    // -----------------------------
    const [userTotalRes, userEligibleRes, globalEligibleRes] = await Promise.all([
      // 1) Kullanıcının tüm USD katkısı
      sql/* sql */`
        SELECT COALESCE(SUM(usd_value), 0)::float AS usd_total
        FROM contributions
        WHERE wallet_address = ${wallet}
      `,
      // 2) Kullanıcının MEGY-eligible USD katkısı
      sql/* sql */`
        SELECT COALESCE(SUM(c.usd_value), 0)::float AS usd_eligible
        FROM contributions c
        LEFT JOIN token_registry tr
          ON tr.mint = c.token_contract
        WHERE c.wallet_address = ${wallet}
          AND (
            c.token_contract IS NULL
            OR c.token_contract = ${WSOL_MINT}
            OR UPPER(c.token_symbol) = 'SOL'
            OR (
              tr.status IN ('healthy', 'walking_dead')
              AND tr.status NOT IN ('blacklist', 'redlist', 'deadcoin')
            )
          )
      `,
      // 3) Tüm sistemin MEGY-eligible toplam USD katkısı
      sql/* sql */`
        SELECT COALESCE(SUM(c.usd_value), 0)::float AS usd_eligible
        FROM contributions c
        LEFT JOIN token_registry tr
          ON tr.mint = c.token_contract
        WHERE c.usd_value > 0
          AND (
            c.token_contract IS NULL
            OR c.token_contract = ${WSOL_MINT}
            OR UPPER(c.token_symbol) = 'SOL'
            OR (
              tr.status IN ('healthy', 'walking_dead')
              AND tr.status NOT IN ('blacklist', 'redlist', 'deadcoin')
            )
          )
      `,
    ]);

    const userUsdTotal = Number((userTotalRes[0] as any)?.usd_total ?? 0);
    const userUsdEligible = Number((userEligibleRes[0] as any)?.usd_eligible ?? 0);
    const globalUsdEligible = Number((globalEligibleRes[0] as any)?.usd_eligible ?? 0);

    // Pool-mode
    const pool = await getDistributionPoolNumber();
    const share = globalUsdEligible > 0 ? userUsdEligible / globalUsdEligible : 0;
    const poolAmount = pool * share;

    // Rate-mode
    const rate = await getCoincarnationRateNumber();
    const rateAmount = rate > 0 ? userUsdEligible / rate : 0;

    return NextResponse.json({
      success: true,

      // NEW: finalized truth (varsa)
      finalized,

      // Backward-compat fields
      pool,
      share,
      amount: poolAmount,

      // Detailed modes
      mode: {
        pool: {
          pool,
          share,
          userUsdEligible,
          globalUsdEligible,
          amount: poolAmount,
        },
        rate: {
          rate,
          userUsd: userUsdEligible,
          amount: rateAmount,
        },
      },

      stats: {
        userUsdTotal,
        userUsdEligible,
        globalUsdEligible,
      },
    });
  } catch (error: any) {
    console.error('[claim/preview] error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
