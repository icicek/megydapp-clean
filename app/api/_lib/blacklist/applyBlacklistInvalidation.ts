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
};

export async function applyBlacklistInvalidation(
  args: ApplyBlacklistInvalidationArgs
): Promise<ApplyBlacklistInvalidationResult> {
  const { mint, changedBy = null, reason = 'blacklist invalidation' } = args;

  const lockKey =
    (BigInt(942004) * BigInt(1_000_000_000) + BigInt(
      Array.from(mint).reduce((a, ch) => (a + ch.charCodeAt(0)) % 1000000, 0)
    )).toString();

  await sql`SELECT pg_advisory_lock(${lockKey}::bigint)`;

  try {
    await sql`BEGIN`;

    // 1) Find non-completed contributions for this mint.
    // We intentionally do NOT touch completed snapshots here.
    const rows = (await sql/* sql */`
      SELECT DISTINCT
        c.id,
        c.phase_id
      FROM contributions c
      LEFT JOIN phases p
        ON p.id = c.phase_id
      WHERE c.token_contract = ${mint}
        AND COALESCE(c.network, 'solana') = 'solana'
        AND (
          c.phase_id IS NULL
          OR p.snapshot_taken_at IS NULL
          OR COALESCE(p.status, '') IN ('active', 'reviewing', 'planned')
        )
      ORDER BY c.id ASC
      FOR UPDATE OF c
    `) as any[];

    const contributionIds = rows.map((r: any) => Number(r.id)).filter((n: number) => n > 0);

    if (contributionIds.length === 0) {
      await sql`COMMIT`;
      return {
        success: true,
        mint,
        touchedContributionIds: [],
        deletedAllocationRows: 0,
        touchedPhaseIds: [],
        invalidatedContributionCount: 0,
      };
    }

    // 2) Collect affected phases from allocations before delete
    const phaseRows = (await sql/* sql */`
      SELECT DISTINCT pa.phase_id
      FROM phase_allocations pa
      JOIN phases p ON p.id = pa.phase_id
      WHERE pa.contribution_id = ANY(${contributionIds}::bigint[])
        AND p.snapshot_taken_at IS NULL
    `) as any[];

    const touchedPhaseIds = phaseRows
      .map((r: any) => Number(r.phase_id))
      .filter((n: number) => n > 0);

    // 3) Delete allocation rows only for non-completed phases
    const del = (await sql/* sql */`
      DELETE FROM phase_allocations pa
      USING phases p
      WHERE pa.phase_id = p.id
        AND pa.contribution_id = ANY(${contributionIds}::bigint[])
        AND p.snapshot_taken_at IS NULL
      RETURNING pa.contribution_id, pa.phase_id
    `) as any[];

    // 4) Mark contributions as invalidated/refundable helper state
    // phase_id helper is cleared because active/reviewing economic effect is removed.
    await sql/* sql */`
      UPDATE contributions
      SET
        alloc_status = 'invalidated',
        phase_id = NULL,
        alloc_phase_no = NULL,
        alloc_updated_at = NOW()
      WHERE id = ANY(${contributionIds}::bigint[])
    `;

    // 5) Touch phases for UI/cache freshness
    if (touchedPhaseIds.length > 0) {
      await sql/* sql */`
        UPDATE phases
        SET updated_at = NOW()
        WHERE id = ANY(${touchedPhaseIds}::bigint[])
      `;
    }

    // 6) Optional audit trail in contribution meta if you later add columns/table.
    // For now, token audit already exists through token_registry update.

    await sql`COMMIT`;

    return {
      success: true,
      mint,
      touchedContributionIds: contributionIds,
      deletedAllocationRows: del.length,
      touchedPhaseIds,
      invalidatedContributionCount: contributionIds.length,
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