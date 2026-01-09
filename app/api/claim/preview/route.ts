// app/api/claim/preview/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import {
  getDistributionPoolNumber,
  getCoincarnationRateNumber,
} from '@/app/api/_lib/feature-flags';

// Sol için küçük helper (istersen ENV'den de alabiliriz)
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet')?.trim();
    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'Missing wallet' },
        { status: 400 },
      );
    }

    // 1) Kullanıcının toplam USD katkısı (bilgi amaçlı)
    // 2) Kullanıcının MEGY-eligible USD katkısı
    // 3) Tüm sistemin MEGY-eligible toplam USD katkısı
    const [userTotalRes, userEligibleRes, globalEligibleRes] =
      await Promise.all([
        // 1) Kullanıcının tüm USD katkısı (token statüsüne bakmadan)
        sql/* sql */ `
          SELECT COALESCE(SUM(usd_value), 0)::float AS usd_total
          FROM contributions
          WHERE wallet_address = ${wallet}
        `,
        // 2) Kullanıcının MEGY-eligible USD katkısı
        sql/* sql */ `
          SELECT COALESCE(SUM(c.usd_value), 0)::float AS usd_eligible
          FROM contributions c
          LEFT JOIN token_registry tr
            ON tr.mint = c.token_contract
          WHERE c.wallet_address = ${wallet}
            AND (
              -- SOL & native katkılar (contract boş veya SOL sembolü)
              c.token_contract IS NULL
              OR c.token_contract = ${WSOL_MINT}
              OR UPPER(c.token_symbol) = 'SOL'
              OR (
                -- SPL token ise registry.status'e bak
                tr.status IN ('healthy', 'walking_dead')
                AND tr.status NOT IN ('blacklist', 'redlist', 'deadcoin')
              )
            )
        `,
        // 3) Tüm sistemin MEGY-eligible USD katkısı
        sql/* sql */ `
          SELECT COALESCE(SUM(c.usd_value), 0)::float AS usd_eligible
          FROM contributions c
          LEFT JOIN token_registry tr
            ON tr.mint = c.token_contract
          WHERE
            c.usd_value > 0 -- 0 USD olanlar havuzu etkilemesin
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

    const userUsdTotal = Number(
      (userTotalRes[0] as any)?.usd_total ?? 0,
    );
    const userUsdEligible = Number(
      (userEligibleRes[0] as any)?.usd_eligible ?? 0,
    );
    const globalUsdEligible = Number(
      (globalEligibleRes[0] as any)?.usd_eligible ?? 0,
    );

    // 4) Pool-mode (klasik havuz paylaşımı)
    const pool = await getDistributionPoolNumber(); // admin panel: Distribution Pool
    const share =
      globalUsdEligible > 0 ? userUsdEligible / globalUsdEligible : 0;
    const poolAmount = pool * share;

    // 5) Rate-mode (Coincarnation Rate: USD / MEGY)
    const rate = await getCoincarnationRateNumber(); // admin panel: Coincarnation Rate (USD per 1 MEGY)
    const rateAmount = rate > 0 ? userUsdEligible / rate : 0;

    return NextResponse.json({
      success: true,

      // Geriye dönük uyum (eski alanlar)
      pool,
      share,
      amount: poolAmount,

      // Yeni, daha açıklayıcı alanlar
      mode: {
        pool: {
          pool, // havuzun toplam MEGY miktarı
          share, // kullanıcının havuzdaki oranı (0..1)
          userUsdEligible, // kullanıcının MEGY-eligible USD katkısı
          globalUsdEligible, // tüm sistemdeki MEGY-eligible toplam USD
          amount: poolAmount, // bu moda göre hak edilen MEGY
        },
        rate: {
          rate, // 1 MEGY için gereken USD
          userUsd: userUsdEligible, // sadece eligible USD
          amount: rateAmount, // bu moda göre hak edilen MEGY
        },
      },

      // UI / debug için yardımcı alanlar
      stats: {
        userUsdTotal, // kullanıcının tüm USD katkısı (deadcoin + healthy)
        userUsdEligible, // sadece MEGY veren katkılar
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
