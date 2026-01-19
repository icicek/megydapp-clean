// app/api/claim/[wallet]/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { getStatusRow, type TokenStatus } from '@/app/api/_lib/registry';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

async function isDeadcoinForMegy(
  mint: string | null | undefined,
  usd: number,
  cache: Map<string, TokenStatus | null>,
): Promise<boolean> {
  if (!Number.isFinite(usd) || usd === 0) return true;
  if (!mint) return false;

  if (cache.has(mint)) return cache.get(mint) === 'deadcoin';

  try {
    const reg = await getStatusRow(mint);
    const status = (reg?.status ?? null) as TokenStatus | null;
    cache.set(mint, status);
    return status === 'deadcoin';
  } catch (e) {
    console.warn('[claim] getStatusRow failed, treating as non-deadcoin:', (e as any)?.message || e);
    cache.set(mint, null);
    return false;
  }
}

function extractWalletFromPath(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(/\/claim\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export async function GET(req: NextRequest) {
  try {
    const wallet = extractWalletFromPath(req);
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Invalid wallet path' }, { status: 400 });
    }

    // 1) Participant
    const participantResult = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;
    if (participantResult.length === 0) {
      return NextResponse.json({ success: false, error: 'No participant data found' }, { status: 404 });
    }
    const participant = participantResult[0] as any;

    // 2) Referrals count
    const referralResult = await sql`
      SELECT COUNT(*) FROM contributions WHERE referrer_wallet = ${wallet};
    `;
    const referral_count = parseInt((referralResult[0] as any).count || '0', 10);

    // Referral USD contributions (exclude deadcoin for MEGY)
    const referralRows = (await sql/* sql */`
      SELECT token_contract, usd_value
      FROM contributions
      WHERE referrer_wallet = ${wallet};
    `) as any[];

    const statusCacheRef = new Map<string, TokenStatus | null>();
    let referral_usd_contributions = 0;
    for (const row of referralRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      const isDead = await isDeadcoinForMegy(mint, usd, statusCacheRef);
      if (!isDead) referral_usd_contributions += usd;
    }

    // Referral deadcoin distinct count
    const referralDeadcoinRows = (await sql/* sql */`
      SELECT DISTINCT c.token_contract, c.usd_value
      FROM contributions c
      WHERE c.referrer_wallet = ${wallet}
        AND c.token_contract IS NOT NULL;
    `) as any[];

    const referralDeadcoinSet = new Set<string>();
    for (const row of referralDeadcoinRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      if (!mint) continue;
      const isDead = await isDeadcoinForMegy(mint, usd, statusCacheRef);
      if (isDead) referralDeadcoinSet.add(mint);
    }
    const referral_deadcoin_count = referralDeadcoinSet.size;

    // Self contributions eligible USD (exclude deadcoin)
    const contribRows = (await sql/* sql */`
      SELECT token_contract, usd_value
      FROM contributions
      WHERE wallet_address = ${wallet};
    `) as any[];

    const statusCacheSelf = new Map<string, TokenStatus | null>();
    let total_usd_contributed = 0;
    for (const row of contribRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      const isDead = await isDeadcoinForMegy(mint, usd, statusCacheSelf);
      if (!isDead) total_usd_contributed += usd;
    }

    const totalCoinsResult = await sql/* sql */`
      SELECT COUNT(*) AS total_coins_contributed
      FROM contributions
      WHERE wallet_address = ${wallet};
    `;
    const total_coins_contributed = parseInt((totalCoinsResult[0] as any).total_coins_contributed || '0', 10);

    // Distinct deadcoin contracts revived (display)
    const deadcoinRows = (await sql/* sql */`
      SELECT DISTINCT token_contract, usd_value
      FROM contributions
      WHERE wallet_address = ${wallet}
        AND token_contract IS NOT NULL;
    `) as any[];

    const deadcoinSet = new Set<string>();
    for (const row of deadcoinRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      if (!mint) continue;
      const isDead = await isDeadcoinForMegy(mint, usd, statusCacheSelf);
      if (isDead) deadcoinSet.add(mint);
    }
    const deadcoins_revived = deadcoinSet.size;

    // Transactions history
    const transactionsRaw = await sql`
      SELECT
        id,
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

    const transactions = (transactionsRaw as any[]).map((row) => {
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

    // 3) CorePoint totals (from corepoint_events)
    const cpRows = await sql/* sql */`
      SELECT
        COALESCE(SUM(points) FILTER (WHERE type = 'usd'), 0)::float              AS cp_usd,
        COALESCE(SUM(points) FILTER (WHERE type = 'referral_signup'), 0)::float  AS cp_ref,
        COALESCE(SUM(points) FILTER (WHERE type = 'deadcoin_first'), 0)::float   AS cp_dead,
        COALESCE(SUM(points) FILTER (WHERE type = 'share'), 0)::float            AS cp_share
      FROM corepoint_events
      WHERE wallet_address = ${wallet};
    `;
    const cpRow = cpRows[0] || {};
    const cpCoincarnations = Number((cpRow as any).cp_usd || 0);
    const cpReferrals = Number((cpRow as any).cp_ref || 0);
    const cpDeadcoins = Number((cpRow as any).cp_dead || 0);
    const cpShares = Number((cpRow as any).cp_share || 0);
    const core_point = cpCoincarnations + cpReferrals + cpDeadcoins + cpShares;

    const totalCorePointResult = await sql/* sql */`
      SELECT COALESCE(SUM(points), 0)::float AS total_core_point
      FROM corepoint_events;
    `;
    const total_core_point = Number((totalCorePointResult[0] as any).total_core_point || 0);
    const pvc_share = total_core_point > 0 ? core_point / total_core_point : 0;

    // -----------------------------
    // NEW: Claim truth (snapshot + claims)
    // -----------------------------
    const snaps = (await sql/* sql */`
      SELECT
        phase_id,
        megy_amount,
        contribution_usd,
        share_ratio,
        claim_status,
        created_at,
        coincarnator_no
      FROM claim_snapshots
      WHERE wallet_address = ${wallet}
      ORDER BY phase_id DESC;
    `) as any[];

    const claimsByPhase = (await sql/* sql */`
      SELECT
        phase_id,
        COALESCE(SUM(claim_amount),0)::float AS claimed
      FROM claims
      WHERE wallet_address = ${wallet}
      GROUP BY phase_id
      ORDER BY phase_id DESC;
    `) as any[];

    const claimedMap = new Map<number, number>();
    for (const row of claimsByPhase) {
      const pid = Number(row.phase_id);
      const c = Number(row.claimed ?? 0);
      if (Number.isFinite(pid)) claimedMap.set(pid, c);
    }

    let finalized_megy_total = 0;
    let claimed_megy_total = 0;

    const finalized_by_phase = snaps.map((s) => {
      const pid = Number(s.phase_id);
      const finalized = Number(s.megy_amount ?? 0);
      const claimed = Number(claimedMap.get(pid) ?? 0);
      const claimable = Math.max(finalized - claimed, 0);

      finalized_megy_total += finalized;
      claimed_megy_total += claimed;

      return {
        phase_id: pid,
        finalized_megy: finalized,
        contribution_usd: Number(s.contribution_usd ?? 0),
        share_ratio: Number(s.share_ratio ?? 0),
        claim_status: s.claim_status ?? null,
        created_at: s.created_at ?? null,
        coincarnator_no: s.coincarnator_no ?? null,
        claimed_megy: claimed,
        claimable_megy: claimable,
      };
    });

    const claimable_megy_total = Math.max(finalized_megy_total - claimed_megy_total, 0);
    const claimed_bool = claimed_megy_total > 0;

    return NextResponse.json({
      success: true,
      data: {
        id: participant.id,
        wallet_address: participant.wallet_address,
        referral_code: participant.referral_code || null,

        // Keep legacy field but make it meaningful
        claimed: claimed_bool,

        referral_count,
        referral_usd_contributions,
        referral_deadcoin_count,
        total_usd_contributed,
        total_coins_contributed,
        deadcoins_revived,
        transactions,

        core_point,
        total_core_point,
        pvc_share,
        core_point_breakdown: {
          coincarnations: cpCoincarnations,
          referrals: cpReferrals,
          deadcoins: cpDeadcoins,
          shares: cpShares,
        },

        // NEW claim truth fields
        claim: {
          finalized_megy_total,
          claimed_megy_total,
          claimable_megy_total,
          finalized_by_phase,
        },
      },
    });
  } catch (err) {
    console.error('Error fetching claim data:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
