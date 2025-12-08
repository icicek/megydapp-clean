// app/api/claim/[wallet]/route.ts

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import {
  getStatusRow,
  type TokenStatus,
} from '@/app/api/_lib/registry';

// Hem NEON_DATABASE_URL hem DATABASE_URL için toleranslı olalım
const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

// Deadcoin mi? (MEGY dağıtımı açısından)
//  - usd_value === 0      → deadcoin (fiyat bulunamamış)
//  - token_registry.status = 'deadcoin' → deadcoin (vote/admin)
async function isDeadcoinForMegy(
  mint: string | null | undefined,
  usd: number,
  cache: Map<string, TokenStatus | null>,
): Promise<boolean> {
  // Fiyat 0 ise zaten deadcoin; statüye bakmaya gerek yok
  if (!Number.isFinite(usd) || usd === 0) return true;

  if (!mint) return false;

  if (cache.has(mint)) {
    const s = cache.get(mint);
    return s === 'deadcoin';
  }

  try {
    const reg = await getStatusRow(mint);
    const status = (reg?.status ?? null) as TokenStatus | null;
    cache.set(mint, status);
    return status === 'deadcoin';
  } catch (e) {
    console.warn(
      '[claim] getStatusRow failed, treating as non-deadcoin:',
      (e as any)?.message || e,
    );
    cache.set(mint, null);
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.pathname.match(/\/claim\/([^/]+)/)?.[1];

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet path' },
        { status: 400 },
      );
    }

    // 1) Katılımcı bilgisi
    const participantResult = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;
    if (participantResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No participant data found' },
        { status: 404 },
      );
    }
    const participant = participantResult[0];

    // 2) Contributions tablosundan istatistikler (display amaçlı)

    // Referans sayısı
    const referralResult = await sql`
      SELECT COUNT(*) FROM contributions WHERE referrer_wallet = ${wallet};
    `;
    const referral_count = parseInt((referralResult[0] as any).count || '0', 10);

    // Referans katkı USD toplamı (MEGY açısından deadcoin katkılarını hariç tutalım)
    const referralRows = await sql/* sql */`
      SELECT token_contract, usd_value
      FROM contributions
      WHERE referrer_wallet = ${wallet};
    ` as any[];

    const statusCacheRef = new Map<string, TokenStatus | null>();
    let referral_usd_contributions = 0;
    for (const row of referralRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      const isDead = await isDeadcoinForMegy(mint, usd, statusCacheRef);
      if (!isDead) referral_usd_contributions += usd;
    }

    // Referans deadcoin sayısı (display için, hem fiyat 0 hem statü deadcoin)
    const referralDeadcoinResult = await sql/* sql */`
      SELECT DISTINCT c.token_contract, c.usd_value
      FROM contributions c
      WHERE c.referrer_wallet = ${wallet}
        AND c.token_contract IS NOT NULL;
    ` as any[];
    const referralDeadcoinSet = new Set<string>();
    for (const row of referralDeadcoinResult) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      if (!mint) continue;

      const isDead = await isDeadcoinForMegy(mint, usd, statusCacheRef);
      if (isDead) referralDeadcoinSet.add(mint);
    }
    const referral_deadcoin_count = referralDeadcoinSet.size;

    // Kendi katkıları: MEGY için eligible USD'yi manuel hesaplayacağız
    const contribRows = await sql/* sql */`
      SELECT token_contract, usd_value
      FROM contributions
      WHERE wallet_address = ${wallet};
    ` as any[];

    const statusCacheSelf = new Map<string, TokenStatus | null>();
    let total_usd_contributed = 0;
    for (const row of contribRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      const isDead = await isDeadcoinForMegy(mint, usd, statusCacheSelf);
      if (!isDead) total_usd_contributed += usd;
    }

    // Toplam token sayısı (display için hepsi sayılmaya devam ediyor)
    const totalCoinsResult = await sql/* sql */`
      SELECT COUNT(*) AS total_coins_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const total_coins_contributed = parseInt(
      (totalCoinsResult[0] as any).total_coins_contributed || '0',
      10,
    );

    // Eşsiz deadcoin kontrat adresleri (display için)
    const deadcoinRows = await sql/* sql */`
      SELECT DISTINCT token_contract, usd_value
      FROM contributions
      WHERE wallet_address = ${wallet}
        AND token_contract IS NOT NULL;
    ` as any[];

    const deadcoinSet = new Set<string>();
    for (const row of deadcoinRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      if (!mint) continue;

      const isDead = await isDeadcoinForMegy(mint, usd, statusCacheSelf);
      if (isDead) deadcoinSet.add(mint);
    }

    // 🔹 Bu cüzdanın kaç FARKLI deadcoin’i Coincarnate ettiği
    const deadcoins_revived = deadcoinSet.size;

    // 🔹 İşlem geçmişi (DETAYLI) — id + signature + hash + contract
    const transactionsRaw = await sql`
      SELECT
        id,                       -- primary key
        token_symbol,
        token_amount,
        usd_value,
        timestamp,
        transaction_signature,
        tx_hash,
        token_contract
      FROM contributions
      WHERE wallet_address = ${wallet}
      ORDER BY timestamp DESC;
    `;

    // Frontend’e giden shape
    const transactions = (transactionsRaw as any[]).map((row) => {
      // 🔸 Stabil tx_id: ÖNCE blockchain hash, sonra id fallback
      const stableTxId =
        (row.transaction_signature && String(row.transaction_signature)) ||
        (row.tx_hash && String(row.tx_hash)) ||
        (row.id != null ? String(row.id) : null);

      return {
        token_symbol: row.token_symbol,
        token_amount: row.token_amount,
        usd_value: row.usd_value,
        timestamp: row.timestamp,

        token_contract: row.token_contract,
        transaction_signature: row.transaction_signature,
        tx_hash: row.tx_hash,

        tx_id: stableTxId,
      };
    });

    // 3) CorePoint: TAMAMEN corepoint_events tablosundan
    const cpRows = await sql/* sql */`
      SELECT
        COALESCE(SUM(points) FILTER (WHERE type = 'usd'), 0)::float             AS cp_usd,
        COALESCE(SUM(points) FILTER (WHERE type = 'referral_signup'), 0)::float AS cp_ref,
        COALESCE(SUM(points) FILTER (WHERE type = 'deadcoin_first'), 0)::float  AS cp_dead,
        COALESCE(SUM(points) FILTER (WHERE type = 'share'), 0)::float           AS cp_share
      FROM corepoint_events
      WHERE wallet_address = ${wallet};
    `;
    const cpRow = cpRows[0] || {};
    const cpCoincarnations = Number(cpRow.cp_usd || 0);
    const cpReferrals = Number(cpRow.cp_ref || 0);
    const cpDeadcoins = Number(cpRow.cp_dead || 0);
    const cpShares = Number(cpRow.cp_share || 0);

    const core_point = cpCoincarnations + cpReferrals + cpDeadcoins + cpShares;

    // 4) Tüm sistemdeki toplam CorePoint (corepoint_events üzerinden)
    const totalCorePointResult = await sql/* sql */`
      SELECT COALESCE(SUM(points), 0)::float AS total_core_point
      FROM corepoint_events;
    `;
    const total_core_point = Number(
      (totalCorePointResult[0] as any).total_core_point || 0,
    );
    const pvc_share =
      total_core_point > 0 ? core_point / total_core_point : 0;

    return NextResponse.json({
      success: true,
      data: {
        id: participant.id,
        wallet_address: participant.wallet_address,
        referral_code: participant.referral_code || null,
        claimed: participant.claimed || false,

        // Display istatistikleri (MEGY-eligible katkılara göre)
        referral_count,
        referral_usd_contributions,
        referral_deadcoin_count,
        total_usd_contributed,
        total_coins_contributed,
        deadcoins_revived,

        // 🔹 Map’lenmiş transactions (tx_id artık gerçek hash’e yakın)
        transactions,

        // CorePoint (artık tamamen corepoint_events tabanlı)
        core_point,
        total_core_point,
        pvc_share,
        core_point_breakdown: {
          coincarnations: cpCoincarnations,
          referrals: cpReferrals,
          deadcoins: cpDeadcoins,
          shares: cpShares,
        },
      },
    });
  } catch (err) {
    console.error('Error fetching claim data:', err);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}
