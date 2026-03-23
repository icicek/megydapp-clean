import { sql } from '@/app/api/_lib/db';

type ApplyBlacklistInvalidationArgs = {
  mint: string;
  changedBy?: string | null;
  reason?: string | null;
};

type ApplyBlacklistInvalidationResult = {
  success: true;
  mint: string;
  touchedContributionIds: number[];
  deletedAllocationRows: number;
  touchedPhaseIds: number[];
  invalidatedContributionCount: number;
  invalidationRowsUpserted: number;
};

function num(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

const EPS = 1e-9;

export async function applyBlacklistInvalidation(
  args: ApplyBlacklistInvalidationArgs
): Promise<ApplyBlacklistInvalidationResult> {
  const { mint, changedBy = null, reason = 'blacklist invalidation' } = args;

  const hash = Array.from(mint).reduce((a, ch) => (a + ch.charCodeAt(0)) % 1000000, 0);
  const lockKey = (BigInt(942004) * BigInt(1_000_000_000) + BigInt(hash)).toString();

  await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;

  try {
    await sql`BEGIN`;

    /**
     * 1) Open-phase allocations for this mint
     *    Only non-completed phase allocations are invalidated.
     *    Completed/snapshotted phases are intentionally untouched.
     */
    const openAllocRows = (await sql/* sql */`
      SELECT
        pa.contribution_id,
        pa.phase_id,
        c.wallet_address,
        COALESCE(c.token_amount, 0)::numeric AS token_amount,
        COALESCE(c.usd_value, 0)::numeric AS total_usd,
        COALESCE(pa.usd_allocated, 0)::numeric AS invalidated_usd,
        COALESCE(pa.megy_allocated, 0)::numeric AS invalidated_megy
      FROM phase_allocations pa
      JOIN contributions c
        ON c.id = pa.contribution_id
      JOIN phases p
        ON p.id = pa.phase_id
      WHERE c.token_contract = ${mint}
        AND COALESCE(c.network, 'solana') = 'solana'
        AND p.snapshot_taken_at IS NULL
      FOR UPDATE OF pa, c
    `) as any[];

    /**
     * 2) Pending / unassigned remainder for this mint
     *    These have not become completed truth either, so blacklist should
     *    invalidate that remaining economic path as well.
     */
    const pendingRows = (await sql/* sql */`
      WITH alloc AS (
        SELECT
          contribution_id,
          COALESCE(SUM(COALESCE(usd_allocated,0)::numeric),0)::numeric AS usd_alloc
        FROM phase_allocations
        GROUP BY contribution_id
      )
      SELECT
        c.id AS contribution_id,
        NULL::bigint AS phase_id,
        c.wallet_address,
        COALESCE(c.token_amount, 0)::numeric AS token_amount,
        COALESCE(c.usd_value, 0)::numeric AS total_usd,
        GREATEST(
          COALESCE(c.usd_value, 0)::numeric - COALESCE(a.usd_alloc, 0)::numeric,
          0
        )::numeric AS invalidated_usd,
        0::numeric AS invalidated_megy
      FROM contributions c
      LEFT JOIN alloc a
        ON a.contribution_id = c.id
      WHERE c.token_contract = ${mint}
        AND COALESCE(c.network, 'solana') = 'solana'
        AND COALESCE(c.alloc_status, 'unassigned') IN ('unassigned', 'partial', 'pending')
        AND GREATEST(
          COALESCE(c.usd_value, 0)::numeric - COALESCE(a.usd_alloc, 0)::numeric,
          0
        )::numeric > 0
      FOR UPDATE OF c
    `) as any[];

    const touchedContributionIds = Array.from(
      new Set(
        [...openAllocRows, ...pendingRows]
          .map((r: any) => Number(r.contribution_id))
          .filter((n: number) => n > 0)
      )
    );

    if (touchedContributionIds.length === 0) {
      await sql`COMMIT`;
      return {
        success: true,
        mint,
        touchedContributionIds: [],
        deletedAllocationRows: 0,
        touchedPhaseIds: [],
        invalidatedContributionCount: 0,
        invalidationRowsUpserted: 0,
      };
    }

    const touchedPhaseIds = Array.from(
      new Set(
        openAllocRows
          .map((r: any) => Number(r.phase_id))
          .filter((n: number) => n > 0)
      )
    );

    /**
     * 3) Aggregate invalidation into ONE row per contribution_id
     */
    const aggregated = new Map<
      number,
      {
        contributionId: number;
        walletAddress: string;
        invalidatedUsd: number;
        invalidatedMegy: number;
        invalidatedTokenAmount: number;
      }
    >();

    const addAggregate = (row: any) => {
      const contributionId = Number(row.contribution_id);
      if (!Number.isFinite(contributionId) || contributionId <= 0) return;

      const totalUsd = num(row.total_usd, 0);
      const invalidatedUsd = num(row.invalidated_usd, 0);
      const invalidatedMegy = num(row.invalidated_megy, 0);
      const tokenAmount = num(row.token_amount, 0);

      const invalidatedTokenAmount =
        totalUsd > EPS ? (tokenAmount * invalidatedUsd) / totalUsd : 0;

      const prev = aggregated.get(contributionId);

      if (!prev) {
        aggregated.set(contributionId, {
          contributionId,
          walletAddress: String(row.wallet_address || '').trim(),
          invalidatedUsd,
          invalidatedMegy,
          invalidatedTokenAmount,
        });
        return;
      }

      prev.invalidatedUsd += invalidatedUsd;
      prev.invalidatedMegy += invalidatedMegy;
      prev.invalidatedTokenAmount += invalidatedTokenAmount;

      if (!prev.walletAddress && row.wallet_address) {
        prev.walletAddress = String(row.wallet_address || '').trim();
      }
    };

    for (const row of openAllocRows) addAggregate(row);
    for (const row of pendingRows) addAggregate(row);

    let invalidationRowsUpserted = 0;

    for (const item of aggregated.values()) {
      await sql/* sql */`
        INSERT INTO contribution_invalidations (
          contribution_id,
          mint,
          wallet_address,
          phase_id,
          invalidated_usd,
          invalidated_megy,
          invalidated_token_amount,
          reason,
          refund_status,
          changed_by,
          created_at,
          updated_at
        )
        VALUES (
          ${item.contributionId}::bigint,
          ${mint}::text,
          ${item.walletAddress}::text,
          NULL,
          ${item.invalidatedUsd}::numeric,
          ${item.invalidatedMegy}::numeric,
          ${item.invalidatedTokenAmount}::numeric,
          ${reason}::text,
          'available'::text,
          ${changedBy}::text,
          NOW(),
          NOW()
        )
        ON CONFLICT (contribution_id)
        DO UPDATE SET
          mint = EXCLUDED.mint,
          wallet_address = EXCLUDED.wallet_address,
          phase_id = NULL,
          invalidated_usd = EXCLUDED.invalidated_usd,
          invalidated_megy = EXCLUDED.invalidated_megy,
          invalidated_token_amount = EXCLUDED.invalidated_token_amount,
          reason = EXCLUDED.reason,
          refund_status = CASE
            WHEN contribution_invalidations.refund_status IN ('requested', 'refunded')
              THEN contribution_invalidations.refund_status
            ELSE 'available'
          END,
          changed_by = EXCLUDED.changed_by,
          updated_at = NOW()
      `;
      invalidationRowsUpserted += 1;
    }

    /**
     * 4) Delete only non-completed phase allocations
     */
    const del = (await sql/* sql */`
      DELETE FROM phase_allocations pa
      USING phases p
      WHERE pa.phase_id = p.id
        AND pa.contribution_id = ANY(${touchedContributionIds}::bigint[])
        AND p.snapshot_taken_at IS NULL
      RETURNING pa.contribution_id, pa.phase_id
    `) as any[];

    /**
     * 5) Recompute helper fields from remaining allocation truth.
     *    Important: a contribution may still have completed allocations left.
     *    In that case, do NOT mark the whole contribution invalidated.
     */
    await sql/* sql */`
      WITH ids AS (
        SELECT UNNEST(${touchedContributionIds}::bigint[]) AS contribution_id
      ),
      remaining AS (
        SELECT
          pa.contribution_id,
          COALESCE(SUM(COALESCE(pa.usd_allocated,0)::numeric),0)::numeric AS usd_alloc
        FROM phase_allocations pa
        WHERE pa.contribution_id = ANY(${touchedContributionIds}::bigint[])
        GROUP BY pa.contribution_id
      ),
      last_phase AS (
        SELECT DISTINCT ON (pa.contribution_id)
          pa.contribution_id,
          pa.phase_id,
          p.phase_no
        FROM phase_allocations pa
        JOIN phases p
          ON p.id = pa.phase_id
        WHERE pa.contribution_id = ANY(${touchedContributionIds}::bigint[])
        ORDER BY pa.contribution_id, p.phase_no DESC, pa.created_at DESC
      )
      UPDATE contributions c
      SET
        alloc_status = CASE
          WHEN COALESCE(r.usd_alloc, 0)::numeric > ${EPS}::numeric THEN 'allocated'
          ELSE 'invalidated'
        END,
        phase_id = CASE
          WHEN COALESCE(r.usd_alloc, 0)::numeric > ${EPS}::numeric THEN lp.phase_id
          ELSE NULL
        END,
        alloc_phase_no = CASE
          WHEN COALESCE(r.usd_alloc, 0)::numeric > ${EPS}::numeric THEN lp.phase_no
          ELSE NULL
        END,
        alloc_updated_at = NOW()
      FROM ids
      LEFT JOIN remaining r
        ON r.contribution_id = ids.contribution_id
      LEFT JOIN last_phase lp
        ON lp.contribution_id = ids.contribution_id
      WHERE c.id = ids.contribution_id
    `;

    /**
     * 6) Touch affected open phases for freshness
     */
    if (touchedPhaseIds.length > 0) {
      await sql/* sql */`
        UPDATE phases
        SET updated_at = NOW()
        WHERE id = ANY(${touchedPhaseIds}::bigint[])
      `;
    }

    await sql`COMMIT`;

    return {
      success: true,
      mint,
      touchedContributionIds,
      deletedAllocationRows: del.length,
      touchedPhaseIds,
      invalidatedContributionCount: touchedContributionIds.length,
      invalidationRowsUpserted,
    };
  } catch (e) {
    try {
      await sql`ROLLBACK`;
    } catch {}
    throw e;
  } finally {
    await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
  }
}