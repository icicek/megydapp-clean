// app/api/claim/[wallet]/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { getStatusRow, type TokenStatus } from '@/app/api/_lib/registry';
import { generateReferralCode } from '@/app/api/utils/generateReferralCode';

const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ParticipantRow {
  id: string;
  wallet_address: string;
  referral_code: string | null;
}

interface IdentityRow {
  identity_id: string;
  coincarnator_no: number | null;
}

interface WalletRow {
  wallet_address: string;
}

interface InvalidationRow {
  contribution_id: number;
  invalidation_id: number | null;
  invalidated_usd: number;
  invalidated_token_amount: number;
  refund_requested: boolean;
  refunded: boolean;
  refund_fee_paid: boolean;
  requested_at: string | null;
  refunded_at: string | null;
}

interface ReferralContributionRow {
  id?: number | string;
  token_contract: string | null;
  usd_value: number | string | null;
  invalidated_usd: number | string | null;
}

interface ContributionRow {
  id: number | string;
  wallet_address: string;
  token_contract: string | null;
  usd_value: number | string | null;
}

interface TotalCoinsRow {
  total_coins_contributed: number | string | null;
}

interface TransactionRow {
  id: number | string;
  wallet_address: string;
  token_symbol: string | null;
  token_amount: number | string | null;
  usd_value: number | string | null;
  timestamp: string | Date | null;
  transaction_signature: string | null;
  tx_hash: string | null;
  token_contract: string | null;
  current_token_status: string | null;
}

interface CorePointRow {
  cp_usd: number | string | null;
  cp_ref: number | string | null;
  cp_dead: number | string | null;
  cp_share: number | string | null;
}

interface GlobalCorePointRow {
  global_core_point: number | string | null;
}

interface ReferralCodeRow {
  referral_code: string | null;
}

interface ClaimSnapshotRow {
  wallet_address: string;
  phase_id: number | string;
  phase_no: number | string | null;
  phase_name: string | null;
  megy_amount: number | string | null;
  contribution_usd: number | string | null;
  share_ratio: number | string | null;
  claim_status: string | null;
  created_at: string | Date | null;
  coincarnator_no: number | string | null;
}

interface ClaimByPhaseRow {
  phase_id: number | string;
  claimed: number | string | null;
}

interface ClaimPhaseSummary {
  phase_id: number;
  phase_no: number | null;
  phase_name: string | null;
  finalized_megy: number;
  contribution_usd: number;
  share_ratio: number;
  claim_status: string | null;
  created_at: string | Date | null;
  coincarnator_no: number | null;
  coincarnator_nos: number[];
  wallet_count: number;
  claimed_megy: number;
  claimable_megy: number;
}

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
  } catch (error: unknown) {
    console.warn(
      '[claim] getStatusRow failed, treating as non-deadcoin:',
      getErrorMessage(error)
    );

    cache.set(mint, null);
    return false;
  }
}

function extractWalletFromPath(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(/\/claim\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function parsePhaseId(req: NextRequest): number | null {
  const raw =
    req.nextUrl.searchParams.get('phase_id') ??
    req.nextUrl.searchParams.get('phaseId');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseScope(req: NextRequest): 'wallet' | 'identity' {
  const raw = req.nextUrl.searchParams.get('scope');
  return raw === 'identity' ? 'identity' : 'wallet';
}

export async function GET(req: NextRequest) {
  try {
    const wallet = extractWalletFromPath(req);
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Invalid wallet path' }, { status: 400 });
    }

    const requestedPhaseId = parsePhaseId(req);
    const requestedScope = parseScope(req);

    // 1) Participant
    // A wallet may belong to an identity even if it has no direct Coincarnation record.
    // In that case, claim/transaction data stays empty, but identity-wide PVC/CorePoint
    // must still be calculated below.
    const participantResult = await sql`
    SELECT * FROM participants WHERE wallet_address = ${wallet} LIMIT 1;
    `;

    const participant =
      (participantResult[0] as ParticipantRow | undefined) ?? {
    id: '-',
    wallet_address: wallet,
    referral_code: null,
    };
    // Identity-aware wallet scope for Personal Value Currency / CorePoint
    // Claim/refund/transaction data remains active-wallet based.
    let activeIdentityId: string | null = null;
    let corePointWallets: string[] = [wallet];
    let identityCoincarnatorNo: number | null = null;

    try {
      const identityRows = (await sql/* sql */`
        SELECT iw.identity_id, i.coincarnator_no
        FROM identity_wallets iw
        JOIN identities i
          ON i.id = iw.identity_id
        WHERE iw.chain = 'solana'
          AND LOWER(wallet_address) = LOWER(${wallet})
        LIMIT 1;
      `) as IdentityRow[];

      const identityId = identityRows?.[0]?.identity_id ?? null;
      activeIdentityId = identityId ? String(identityId) : null;
      identityCoincarnatorNo =
        identityRows?.[0]?.coincarnator_no != null
          ? Number(identityRows[0].coincarnator_no)
          : null;

      if (identityId) {
        const linkedRows = (await sql/* sql */`
          SELECT wallet_address
          FROM identity_wallets
          WHERE identity_id = ${identityId}
            AND chain = 'solana';
        `) as WalletRow[];

        const linkedWallets = linkedRows
          .map((row) => String(row.wallet_address || '').trim())
          .filter(Boolean);

        if (linkedWallets.length > 0) {
          corePointWallets = Array.from(new Set(linkedWallets));
        }
      }
    } catch (error: unknown) {
      console.warn(
        '[claim] identity wallet scope failed, falling back to active wallet:',
        getErrorMessage(error)
      );

      corePointWallets = [wallet];
    }
    const claimWallets =
      requestedScope === 'identity' && activeIdentityId
        ? corePointWallets
        : [wallet];

    const isIdentityClaimScope =
      requestedScope === 'identity' && activeIdentityId && claimWallets.length > 1;
    // Blacklist invalidation ledger for this wallet
    const invalidationRows = (await sql/* sql */`
      SELECT
        contribution_id,
        MAX(id)::int AS invalidation_id,
        COALESCE(SUM(invalidated_usd), 0)::float AS invalidated_usd,
        COALESCE(SUM(invalidated_token_amount), 0)::float AS invalidated_token_amount,
        BOOL_OR(refund_status = 'requested') AS refund_requested,
        BOOL_OR(refund_status = 'refunded') AS refunded,
        BOOL_OR(COALESCE(refund_fee_paid, false)) AS refund_fee_paid,
        MAX(requested_at) AS requested_at,
        MAX(refunded_at) AS refunded_at
      FROM contribution_invalidations
      WHERE wallet_address = ANY(${claimWallets})
      GROUP BY contribution_id
    `) as InvalidationRow[];

    const invalidationMap = new Map<number, {
      invalidation_id: number | null;
      invalidated_usd: number;
      invalidated_token_amount: number;
      refund_status: 'available' | 'requested' | 'refunded';
      refund_fee_paid: boolean;
      requested_at: string | null;
      refunded_at: string | null;
    }>();

    for (const row of invalidationRows) {
      const contributionId = Number(row.contribution_id);
      if (!Number.isFinite(contributionId) || contributionId <= 0) continue;

      const refunded = !!row.refunded;
      const requested = !!row.refund_requested;

      invalidationMap.set(contributionId, {
        invalidation_id: Number.isFinite(Number(row.invalidation_id))
          ? Number(row.invalidation_id)
          : null,
        invalidated_usd: Number(row.invalidated_usd ?? 0),
        invalidated_token_amount: Number(row.invalidated_token_amount ?? 0),
        refund_status: refunded ? 'refunded' : requested ? 'requested' : 'available',
        refund_fee_paid: Boolean(row.refund_fee_paid),
        requested_at: row.requested_at ? String(row.requested_at) : null,
        refunded_at: row.refunded_at ? String(row.refunded_at) : null,
      });
    }

    // 2) Referred identities count (identity-aware)
    let referral_count = 0;

    try {
      const referralScope = activeIdentityId
        ? `identity:${activeIdentityId}`
        : `wallet:${wallet.toLowerCase()}`;

      const referralResult = await sql/* sql */`
        SELECT COUNT(DISTINCT referred_scope)::int AS count
        FROM referral_identity_awards
        WHERE referrer_scope = ${referralScope}
      `;

      referral_count = Number(referralResult?.[0]?.count || 0);
    } catch (error: unknown) {
      console.warn(
        '[claim] referral identity count failed:',
        getErrorMessage(error)
      );

      referral_count = 0;
    }

    // Referral USD contributions (identity-wide; exclude deadcoin for MEGY)
    // Reward logic is NOT changed here. This only affects profile/stat aggregation.
    const referralRows = (await sql/* sql */`
      SELECT
        c.id,
        c.token_contract,
        c.usd_value,
        COALESCE(inv.invalidated_usd, 0)::float AS invalidated_usd
      FROM contributions c
      LEFT JOIN (
        SELECT
          contribution_id,
          COALESCE(SUM(invalidated_usd), 0)::float AS invalidated_usd
        FROM contribution_invalidations
        GROUP BY contribution_id
      ) inv
        ON inv.contribution_id = c.id
      WHERE c.referrer_wallet = ANY(${corePointWallets});
    `) as ReferralContributionRow[];

    const statusCacheRef = new Map<string, TokenStatus | null>();
    let referral_usd_contributions = 0;

    for (const row of referralRows) {
      const rawUsd = Number(row.usd_value ?? 0);
      const effectiveUsd = Math.max(rawUsd - Number(row.invalidated_usd ?? 0), 0);

      const mint = row.token_contract as string | null;
      const isDead = await isDeadcoinForMegy(mint, effectiveUsd, statusCacheRef);

      if (!isDead) referral_usd_contributions += effectiveUsd;
    }

    // Referral deadcoin distinct count (identity-wide)
    const referralDeadcoinRows = (await sql/* sql */`
      SELECT
        c.token_contract,
        c.usd_value,
        COALESCE(inv.invalidated_usd, 0)::float AS invalidated_usd
      FROM contributions c
      LEFT JOIN (
        SELECT
          contribution_id,
          COALESCE(SUM(invalidated_usd), 0)::float AS invalidated_usd
        FROM contribution_invalidations
        GROUP BY contribution_id
      ) inv
        ON inv.contribution_id = c.id
      WHERE c.referrer_wallet = ANY(${corePointWallets})
        AND c.token_contract IS NOT NULL;
    `) as ReferralContributionRow[];

    const referralDeadcoinSet = new Set<string>();

    for (const row of referralDeadcoinRows) {
      const rawUsd = Number(row.usd_value ?? 0);
      const effectiveUsd = Math.max(rawUsd - Number(row.invalidated_usd ?? 0), 0);

      const mint = row.token_contract as string | null;
      if (!mint) continue;

      const isDead = await isDeadcoinForMegy(mint, effectiveUsd, statusCacheRef);
      if (isDead) referralDeadcoinSet.add(mint);
    }

    const referral_deadcoin_count = referralDeadcoinSet.size;

    // Self contributions eligible USD (exclude deadcoin)
    const contribRows = (await sql/* sql */`
      SELECT id, wallet_address, token_contract, usd_value
      FROM contributions
      WHERE wallet_address = ANY(${claimWallets});
    `) as ContributionRow[];

    const statusCacheSelf = new Map<string, TokenStatus | null>();
    let total_usd_contributed = 0;
    for (const row of contribRows) {
      const contributionId = Number(row.id);
      const inv = invalidationMap.get(contributionId);
      const rawUsd = Number(row.usd_value ?? 0);
      const effectiveUsd = Math.max(rawUsd - Number(inv?.invalidated_usd ?? 0), 0);

      const mint = row.token_contract as string | null;
      const isDead = await isDeadcoinForMegy(mint, effectiveUsd, statusCacheSelf);
      if (!isDead) total_usd_contributed += effectiveUsd;
    }

    const totalCoinsResult = await sql/* sql */`
      SELECT COUNT(*) AS total_coins_contributed
      FROM contributions
      WHERE wallet_address = ANY(${claimWallets});
    `;
    const totalCoinsRow =
      totalCoinsResult[0] as TotalCoinsRow | undefined;

    const total_coins_contributed = Number.parseInt(
      String(totalCoinsRow?.total_coins_contributed ?? 0),
      10
    );

    // Distinct deadcoin contracts revived (identity-aware)
    let deadcoins_revived = 0;

    try {
      const deadcoinScope = activeIdentityId
        ? `identity:${activeIdentityId}`
        : `wallet:${wallet.toLowerCase()}`;

      const deadcoinAwardRows = await sql/* sql */`
        SELECT COUNT(DISTINCT token_contract)::int AS count
        FROM deadcoin_identity_awards
        WHERE identity_scope = ${deadcoinScope}
      `;

      deadcoins_revived = Number(deadcoinAwardRows?.[0]?.count || 0);
    } catch (error: unknown) {
      console.warn(
        '[claim] deadcoin identity count failed:',
        getErrorMessage(error)
      );

      deadcoins_revived = 0;
    }

    // Transactions history
    const transactionsRaw = await sql`
    SELECT
      c.id,
      c.wallet_address,
      c.token_symbol,
      c.token_amount,
      c.usd_value,
      c.timestamp,
      c.transaction_signature,
      c.tx_hash,
      c.token_contract,
      tr.status AS current_token_status
    FROM contributions c
    LEFT JOIN token_registry tr
      ON tr.mint = c.token_contract
    WHERE c.wallet_address = ANY(${claimWallets})
    ORDER BY c.timestamp DESC;
  `;

    const transactions = (transactionsRaw as TransactionRow[]).map((row) => {
      const contributionId = Number(row.id);
      const inv = invalidationMap.get(contributionId);
      const currentTokenStatus = row.current_token_status ? String(row.current_token_status) : null;

      const stableTxId =
        (row.transaction_signature && String(row.transaction_signature)) ||
        (row.tx_hash && String(row.tx_hash)) ||
        (row.id != null ? String(row.id) : null);

      const refundStatus = inv?.refund_status ?? null;
      const refundFeePaid = Boolean(inv?.refund_fee_paid ?? false);

      let blacklistLabel: string | null = null;

      if (inv) {
        if (refundStatus === 'refunded') {
          blacklistLabel = 'Refunded';
        } else if (refundStatus === 'requested' && refundFeePaid) {
          blacklistLabel = 'Refund Requested';
        } else if (refundStatus === 'requested' && !refundFeePaid) {
          blacklistLabel = 'Complete Refund Request';
        } else if (refundStatus === 'available') {
          blacklistLabel =
            currentTokenStatus === 'blacklist'
              ? 'Blacklisted — Refund Available'
              : 'Previously Blacklisted — Refund Available';
        }
      }

      return {
        contribution_id: contributionId,
        wallet_address: row.wallet_address,
        invalidation_id: inv?.invalidation_id ?? null,
        token_symbol: row.token_symbol,
        token_amount: row.token_amount,
        usd_value: row.usd_value,
        timestamp: row.timestamp,
        token_contract: row.token_contract,
        transaction_signature: row.transaction_signature,
        tx_hash: row.tx_hash,
        tx_id: stableTxId,

        blacklisted: !!inv,
        current_token_status: currentTokenStatus,
        blacklist_label: blacklistLabel,
        refund_status: refundStatus,
        refund_fee_paid: refundFeePaid,
        invalidated_usd: Number(inv?.invalidated_usd ?? 0),
        invalidated_token_amount: Number(inv?.invalidated_token_amount ?? 0),
        requested_at: inv?.requested_at ?? null,
        refunded_at: inv?.refunded_at ?? null,
      };
    });

    // 3) CorePoint totals (identity-aware, from corepoint_events)
    const cpRows = await sql/* sql */`
      SELECT
        COALESCE(
          SUM(points) FILTER (
            WHERE type IN ('usd', 'usd_blacklist_reversal')
          ),
          0
        )::float AS cp_usd,

        COALESCE(
          SUM(points) FILTER (
            WHERE type = 'referral_signup'
          ),
          0
        )::float AS cp_ref,

        COALESCE(
          SUM(points) FILTER (
            WHERE type IN ('deadcoin_first', 'deadcoin_blacklist_reversal')
          ),
          0
        )::float AS cp_dead,

        COALESCE(
          SUM(points) FILTER (
            WHERE type = 'share'
          ),
          0
        )::float AS cp_share
      FROM corepoint_events
      WHERE wallet_address = ANY(${corePointWallets});
    `;
    const cpRow = cpRows[0] as CorePointRow | undefined;

    const cpCoincarnations = Number(cpRow?.cp_usd ?? 0);
    const cpReferrals = Number(cpRow?.cp_ref ?? 0);
    const cpDeadcoins = Number(cpRow?.cp_dead ?? 0);
    const cpShares = Number(cpRow?.cp_share ?? 0);
    const core_point = cpCoincarnations + cpReferrals + cpDeadcoins + cpShares;

    const globalCorePointResult = await sql/* sql */`
      SELECT COALESCE(SUM(points), 0)::float AS global_core_point
      FROM corepoint_events;
    `;

    const globalCorePointRow =
      globalCorePointResult[0] as GlobalCorePointRow | undefined;

    const global_core_point = Number(
      globalCorePointRow?.global_core_point ?? 0
    );

    // User/identity scoped CorePoint.
    // This is the value shown as the user's Personal Value Currency core.
    const total_core_point = core_point;

    // Ecosystem-wide share denominator.
    const pvc_share = global_core_point > 0 ? core_point / global_core_point : 0;
    let identity_referral_code: string | null = null;

    if (activeIdentityId) {
      const existingIdentityCode = (await sql/* sql */`
        SELECT referral_code
        FROM identity_referral_codes
        WHERE identity_id = ${activeIdentityId}
        LIMIT 1
      `) as ReferralCodeRow[];

      if (existingIdentityCode.length > 0 && existingIdentityCode[0]?.referral_code) {
        identity_referral_code = String(existingIdentityCode[0].referral_code);
      } else {
        identity_referral_code = generateReferralCode();

        await sql/* sql */`
          INSERT INTO identity_referral_codes (
            identity_id,
            referral_code
          )
          VALUES (
            ${activeIdentityId},
            ${identity_referral_code}
          )
          ON CONFLICT (identity_id) DO NOTHING
        `;

        const insertedIdentityCode = (await sql/* sql */`
          SELECT referral_code
          FROM identity_referral_codes
          WHERE identity_id = ${activeIdentityId}
          LIMIT 1
        `) as ReferralCodeRow[];

        identity_referral_code =
          insertedIdentityCode?.[0]?.referral_code
            ? String(insertedIdentityCode[0].referral_code)
            : identity_referral_code;
      }
    }

    // -----------------------------
    // Claim truth (snapshot + claims)
    // -----------------------------
    const snaps = (await sql/* sql */`
      SELECT
        cs.wallet_address,  
        cs.phase_id,
        p.phase_no,
        p.name AS phase_name,
        cs.megy_amount,
        cs.contribution_usd,
        cs.share_ratio,
        cs.claim_status,
        cs.created_at,
        cs.coincarnator_no
      FROM claim_snapshots cs
      JOIN phases p ON p.id = cs.phase_id
      WHERE cs.wallet_address = ANY(${claimWallets})
      ORDER BY p.phase_no DESC, cs.created_at DESC;
    `) as ClaimSnapshotRow[]; 

    const claimsByPhase = (await sql/* sql */`
      SELECT
        phase_id,
        COALESCE(SUM(claim_amount),0)::float AS claimed
      FROM claims
      WHERE wallet_address = ANY(${claimWallets})
        AND status IN ('created', 'succeeded')
      GROUP BY phase_id
      ORDER BY phase_id DESC;
    `) as ClaimByPhaseRow[];

    const claimedMap = new Map<number, number>();
    for (const row of claimsByPhase) {
      const pid = Number(row.phase_id);
      const c = Number(row.claimed ?? 0);
      if (Number.isFinite(pid)) claimedMap.set(pid, c);
    }

    // phase filter
    const snapsFiltered = requestedPhaseId
      ? snaps.filter((s) => Number(s.phase_id) === requestedPhaseId)
      : snaps;

    let finalized_megy_total = 0;
    let claimed_megy_total = 0;

    const phaseMap = new Map<number, ClaimPhaseSummary>();

    for (const s of snapsFiltered) {
      const pid = Number(s.phase_id);
      if (!Number.isFinite(pid)) continue;

      const finalized = Number(s.megy_amount ?? 0);

      // Important:
      // claimedMap is phase-level. When multiple wallet snapshots are merged,
      // we should not subtract the full phase claimed amount from every row.
      // For now, claims are summed by phase, then clamped after phase merge.
      const contributionUsd = Number(s.contribution_usd ?? 0);
      const shareRatio = Number(s.share_ratio ?? 0);

      const existing = phaseMap.get(pid) ?? {
        phase_id: pid,
        phase_no: Number(s.phase_no ?? 0) || null,
        phase_name: s.phase_name ? String(s.phase_name) : null,
        finalized_megy: 0,
        contribution_usd: 0,
        share_ratio: 0,
        claim_status: null,
        created_at: s.created_at ?? null,
        coincarnator_no: null,
        coincarnator_nos: [] as number[],
        wallet_count: 0,
        claimed_megy: 0,
        claimable_megy: 0,
      };

      existing.finalized_megy += finalized;
      existing.contribution_usd += contributionUsd;
      existing.share_ratio += shareRatio;
      existing.wallet_count += 1;

      const cno = Number(s.coincarnator_no ?? 0);
      if (Number.isFinite(cno) && cno > 0 && !existing.coincarnator_nos.includes(cno)) {
        existing.coincarnator_nos.push(cno);
      }

      if (!existing.created_at || (s.created_at && new Date(s.created_at).getTime() > new Date(existing.created_at).getTime())) {
        existing.created_at = s.created_at;
      }

      phaseMap.set(pid, existing);
    }

    const finalized_by_phase = Array.from(phaseMap.values())
      .map((phase) => {
        const claimedRaw = Number(claimedMap.get(Number(phase.phase_id)) ?? 0);
        const claimed = Math.min(Math.max(claimedRaw, 0), Number(phase.finalized_megy || 0));
        const claimable = Math.max(Number(phase.finalized_megy || 0) - claimed, 0);

        finalized_megy_total += Number(phase.finalized_megy || 0);
        claimed_megy_total += claimed;

        return {
          ...phase,
          coincarnator_no: phase.coincarnator_nos.length === 1 ? phase.coincarnator_nos[0] : null,
          claimed_megy: claimed,
          claimable_megy: claimable,
          claim_status: claimable <= 0 && Number(phase.finalized_megy || 0) > 0,
        };
      })
      .sort((a, b) => {
        const phaseNoDiff = Number(b.phase_no || 0) - Number(a.phase_no || 0);
        if (phaseNoDiff !== 0) return phaseNoDiff;
        return Number(b.phase_id || 0) - Number(a.phase_id || 0);
      });

    const claimable_megy_total = Math.max(finalized_megy_total - claimed_megy_total, 0);
    const claimed_bool = claimed_megy_total > 0;

    return NextResponse.json({
      success: true,
      phase_id: requestedPhaseId ?? null,
      scope: requestedScope,
      active_identity_id: activeIdentityId,
      claim_wallets: claimWallets,
      claim_wallets_count: claimWallets.length,
      is_identity_claim_scope: Boolean(isIdentityClaimScope),
      data: {
        id: identityCoincarnatorNo ?? '-',
        legacy_participant_id: participant.id,
        wallet_address: participant.wallet_address,
        referral_code: identity_referral_code,
        legacy_referral_code: participant.referral_code || null,
        has_identity_referral_code: Boolean(identity_referral_code),

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
        global_core_point,
        pvc_share,
        core_point_breakdown: {
          coincarnations: cpCoincarnations,
          referrals: cpReferrals,
          deadcoins: cpDeadcoins,
          shares: cpShares,
        },

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
