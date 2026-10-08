//app/api/_lib/blacklist/applyBlacklistInvalidation.ts
import { sql } from '@/app/api/_lib/db';
import {
  reverseContributionCorepoints,
  reverseDeadcoinIdentityAwardsForBlacklist,
} from '@/app/api/_lib/corepoints';

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
  deadcoinReversal?: {
    reversedCount: number;
    reversedPoints: number;
    tokenContract?: string;
    reason?: string;
  };
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
    const deadcoinReversal = await reverseDeadcoinIdentityAwardsForBlacklist({
      mint,
      changedBy,
      reason,
    });

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
        c.transaction_signature,
        c.tx_hash,
        COALESCE(c.token_amount, 0)::numeric AS token_amount,
        COALESCE(c.usd_value, 0)::numeric AS total_usd,
        COALESCE(pa.usd_allocated, 0)::numeric AS invalidated_usd,
        COALESCE(pa.megy_allocated, 0)::numeric AS invalidated_megy,
        CASE
          WHEN COALESCE(c.usd_value, 0)::numeric > 0
          THEN (
            COALESCE(c.token_amount, 0)::numeric
            * COALESCE(pa.usd_allocated, 0)::numeric
            / COALESCE(c.usd_value, 0)::numeric
          )
          ELSE 0::numeric
        END AS invalidated_token_amount
      FROM phase_allocations pa
      JOIN contributions c
        ON c.id = pa.contribution_id
      JOIN phases p
        ON p.id = pa.phase_id
      AND p.is_test = c.is_test
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
          pa.contribution_id,
          COALESCE(
            SUM(
              COALESCE(
                pa.usd_allocated,
                0
              )::numeric
            ),
            0
          )::numeric AS usd_alloc
        FROM phase_allocations pa
        JOIN contributions c_scope
          ON c_scope.id = pa.contribution_id
        JOIN phases p
          ON p.id = pa.phase_id
        AND p.is_test = c_scope.is_test
        GROUP BY pa.contribution_id
      )
      SELECT
        c.id AS contribution_id,
        NULL::bigint AS phase_id,
        c.wallet_address,
        c.transaction_signature,
        c.tx_hash,
        COALESCE(c.token_amount, 0)::numeric AS token_amount,
        COALESCE(c.usd_value, 0)::numeric AS total_usd,
        GREATEST(
          COALESCE(c.usd_value, 0)::numeric - COALESCE(a.usd_alloc, 0)::numeric,
          0
        )::numeric AS invalidated_usd,
        0::numeric AS invalidated_megy,
        CASE
          WHEN COALESCE(c.usd_value, 0)::numeric > 0
          THEN (
            COALESCE(c.token_amount, 0)::numeric
            * GREATEST(
                COALESCE(c.usd_value, 0)::numeric
                - COALESCE(a.usd_alloc, 0)::numeric,
                0
              )::numeric
            / COALESCE(c.usd_value, 0)::numeric
          )
          ELSE 0::numeric
        END AS invalidated_token_amount
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
        deadcoinReversal,
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
     * 3) Aggregate invalidation into ONE row per contribution_id.
     *
     * IMPORTANT:
     * Keep economic amounts as PostgreSQL numeric values for the aggregation
     * instead of converting token amounts to JavaScript Number. This avoids
     * precision loss in the refund path.
     */
    const aggregateRows = (await sql/* sql */`
      SELECT
        c.id AS contribution_id,
        c.wallet_address,
        c.transaction_signature,
        c.tx_hash,

        COALESCE(
          SUM(
            CASE
              WHEN p.snapshot_taken_at IS NULL
              THEN COALESCE(pa.usd_allocated, 0)::numeric
              ELSE 0::numeric
            END
          ),
          0
        )::numeric AS open_invalidated_usd,

        COALESCE(
          SUM(
            CASE
              WHEN p.snapshot_taken_at IS NULL
              THEN COALESCE(pa.megy_allocated, 0)::numeric
              ELSE 0::numeric
            END
          ),
          0
        )::numeric AS open_invalidated_megy,

        COALESCE(c.usd_value, 0)::numeric AS total_usd,
        COALESCE(c.token_amount, 0)::numeric AS token_amount

      FROM contributions c

      LEFT JOIN phase_allocations pa
        ON pa.contribution_id = c.id

      LEFT JOIN phases p
        ON p.id = pa.phase_id
      AND p.is_test = c.is_test

      WHERE c.id =
        ANY(${touchedContributionIds}::bigint[])

      GROUP BY
        c.id,
        c.wallet_address,
        c.transaction_signature,
        c.tx_hash,
        c.usd_value,
        c.token_amount

      ORDER BY c.id ASC
    `) as any[];

    const aggregated = new Map<
      number,
      {
        contributionId: number;
        walletAddress: string;
        txId: string;
        invalidatedUsd: string;
        invalidatedMegy: string;
        invalidatedTokenAmount: string;
      }
    >();

    for (const row of aggregateRows) {
      const contributionId =
        Number(row.contribution_id);

      if (
        !Number.isSafeInteger(contributionId) ||
        contributionId <= 0
      ) {
        continue;
      }

      const totalUsd =
        String(row.total_usd ?? '0');

      const tokenAmount =
        String(row.token_amount ?? '0');

      const openInvalidatedUsd =
        String(row.open_invalidated_usd ?? '0');

      const openInvalidatedMegy =
        String(row.open_invalidated_megy ?? '0');

      /*
       * Pending/unassigned remainder is the part of the contribution
       * that has not been allocated to any phase.
       */
      const exactRows = (await sql/* sql */`
    SELECT
      (
        ${openInvalidatedUsd}::numeric +
        GREATEST(
          ${totalUsd}::numeric -
          COALESCE(
            (
              SELECT SUM(
                COALESCE(pa2.usd_allocated, 0)::numeric
              )
              FROM phase_allocations pa2
              JOIN phases p2
                ON p2.id = pa2.phase_id
              JOIN contributions c2
                ON c2.id = pa2.contribution_id
               AND p2.is_test = c2.is_test
              WHERE pa2.contribution_id =
                ${contributionId}::bigint
            ),
            0
          )::numeric,
          0::numeric
        )
      )::numeric AS invalidated_usd,

      ${openInvalidatedMegy}::numeric
        AS invalidated_megy,

      CASE
        WHEN ${totalUsd}::numeric > 0
        THEN (
          ${tokenAmount}::numeric *
          (
            ${openInvalidatedUsd}::numeric +
            GREATEST(
              ${totalUsd}::numeric -
              COALESCE(
                (
                  SELECT SUM(
                    COALESCE(pa3.usd_allocated, 0)::numeric
                  )
                  FROM phase_allocations pa3
                  JOIN phases p3
                    ON p3.id = pa3.phase_id
                  JOIN contributions c3
                    ON c3.id = pa3.contribution_id
                   AND p3.is_test = c3.is_test
                  WHERE pa3.contribution_id =
                    ${contributionId}::bigint
                ),
                0
              )::numeric,
              0::numeric
            )
          ) /
          ${totalUsd}::numeric
        )::numeric
        ELSE 0::numeric
      END AS invalidated_token_amount
  `) as any[];

      const exact =
        exactRows?.[0];

      if (!exact) {
        throw new Error(
          'BLACKLIST_INVALIDATION_AGGREGATION_FAILED'
        );
      }

      const txId =
        String(
          row.transaction_signature || ''
        ).trim() ||
        String(
          row.tx_hash || ''
        ).trim() ||
        String(contributionId);

      aggregated.set(
        contributionId,
        {
          contributionId,

          walletAddress:
            String(
              row.wallet_address || ''
            ).trim(),

          txId,

          invalidatedUsd:
            String(
              exact.invalidated_usd ?? '0'
            ),

          invalidatedMegy:
            String(
              exact.invalidated_megy ?? '0'
            ),

          invalidatedTokenAmount:
            String(
              exact.invalidated_token_amount ??
              '0'
            ),
        }
      );
    }

    let invalidationRowsUpserted = 0;

    for (const item of aggregated.values()) {
      const upserted = await sql/* sql */`
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
        RETURNING id
      ` as any[];

      invalidationRowsUpserted += 1;

      const invalidationId = Number(upserted?.[0]?.id ?? 0);

      if (invalidationId > 0 && item.walletAddress && item.txId) {
        await reverseContributionCorepoints({
          wallet: item.walletAddress,
          txId: item.txId,
          tokenContract: mint,
          invalidationId,
        });
      }
    }

    /**
     * 4) Delete only non-completed phase allocations
     */
    const del = (await sql/* sql */`
      DELETE FROM phase_allocations pa
      USING phases p, contributions c
      WHERE pa.phase_id = p.id
        AND c.id = pa.contribution_id
        AND p.is_test = c.is_test
        AND pa.contribution_id =
          ANY(${touchedContributionIds}::bigint[])
        AND p.snapshot_taken_at IS NULL
      RETURNING
        pa.contribution_id,
        pa.phase_id
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
          COALESCE(
            SUM(
              COALESCE(
                pa.usd_allocated,
                0
              )::numeric
            ),
            0
          )::numeric AS usd_alloc
        FROM phase_allocations pa
        JOIN contributions c_scope
          ON c_scope.id = pa.contribution_id
        JOIN phases p
          ON p.id = pa.phase_id
        AND p.is_test = c_scope.is_test
        WHERE pa.contribution_id =
          ANY(${touchedContributionIds}::bigint[])
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
      deadcoinReversal,
    };
  } catch (e) {
    try {
      await sql`ROLLBACK`;
    } catch { }
    throw e;
  } finally {
    await sql`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
  }
}