// app/api/_lib/token-registry.ts
import { sql } from '@/app/api/_lib/db';
import type { TokenStatus } from '@/app/api/_lib/types';

export async function getStatus(
  mint: string
): Promise<{ status: TokenStatus; statusAt: string | null }> {
  const rows = (await sql`
    SELECT status::text AS status, status_at
    FROM token_registry
    WHERE mint = ${mint}
    LIMIT 1
  `) as unknown as { status: TokenStatus; status_at: string | null }[];

  if (rows.length === 0) {
    return { status: 'healthy', statusAt: null };
  }
  return { status: rows[0].status, statusAt: rows[0].status_at };
}

type SetStatusInput = {
  mint: string;
  newStatus: TokenStatus;
  changedBy: string;            // admin wallet
  reason?: string | null;
  meta?: any;
};

/**
 * Tek SQL ifadesi (CTE) ile:
 *  - önceki status'u okur,
 *  - upsert yapar,
 *  - audit kaydı yazar,
 *  - güncel status ve statusAt'i döner.
 * Tamamen atomik, transaction kullanmadan (dolayısıyla sql.begin gerektirmez).
 */
export async function setStatus({
  mint,
  newStatus,
  changedBy,
  reason = null,
  meta = {},
}: SetStatusInput): Promise<{ status: TokenStatus; statusAt: string }> {
  const metaJson = meta ? JSON.stringify(meta) : null;

  const rows = (await sql`
    WITH prev AS (
      SELECT status AS old_status
      FROM token_registry
      WHERE mint = ${mint}
    ),
    upsert AS (
      INSERT INTO token_registry (mint, status, status_at, updated_by, reason, meta)
      VALUES (
        ${mint},
        ${newStatus}::token_status_enum,
        NOW(),
        ${changedBy},
        ${reason},
        ${metaJson}
      )
      ON CONFLICT (mint) DO UPDATE
      SET
        status     = ${newStatus}::token_status_enum,
        status_at  = NOW(),
        updated_by = ${changedBy},
        reason     = ${reason},
        meta       = ${metaJson},
        updated_at = NOW()
      RETURNING status, status_at
    ),
    audit_ins AS (
      INSERT INTO token_audit (mint, old_status, new_status, reason, meta, updated_by)
      SELECT
        ${mint},
        (SELECT old_status FROM prev)::token_status_enum,
        (SELECT status FROM upsert)::token_status_enum,
        ${reason},
        ${metaJson},
        ${changedBy}
    )
    SELECT
      (SELECT status::text FROM upsert)   AS status,
      (SELECT status_at     FROM upsert)  AS status_at
  `) as unknown as { status: TokenStatus; status_at: string }[];

  return { status: rows[0].status, statusAt: rows[0].status_at };
}
