// app/api/_lib/token-registry.ts

import { sql } from '@/app/api/_lib/db';
import type { TokenStatus } from '@/app/api/_lib/types';
import { cache, statusKey } from '@/app/api/_lib/cache';

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
  changedBy: string;
  reason?: string | null;
  meta?: any;
};

// ✅ Only deadcoin is lockable; WD/healthy must never carry lock metadata.
function normalizeMetaForStatus(newStatus: TokenStatus, meta: any) {
  const m =
    meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : {};

  // Clean all lock-shaped fields first (defensive)
  delete (m as any).lock;
  delete (m as any).lock_deadcoin;
  delete (m as any).lock_list;
  if (m.lock && typeof m.lock === 'object') delete (m.lock as any).deadcoin;

  if (newStatus === 'deadcoin') {
    // lock deadcoin permanently (whoever/whatever sets it)
    (m as any).lock_deadcoin = true;
    (m as any).lock = true; // backward/compat signal
  }

  return m;
}

export async function setStatus({
  mint,
  newStatus,
  changedBy,
  reason = null,
  meta = {},
}: SetStatusInput): Promise<{ status: TokenStatus; statusAt: string }> {
  const normalizedMeta = normalizeMetaForStatus(newStatus, meta);
  const metaJson = normalizedMeta ? JSON.stringify(normalizedMeta) : null;

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

  // cache invalidation
  cache.del(statusKey(mint));

  return { status: rows[0].status, statusAt: rows[0].status_at };
}
