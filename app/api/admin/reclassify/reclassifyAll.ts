// app/api/admin/reclassify/reclassifyAll.ts
// Metrics-aware, registry-aware, LOCK-safe reclassifier

import classifyToken from '@/app/api/utils/classifyToken';
import {
  resolveEffectiveStatus,
  type EffectiveStatusInput,
} from '@/app/api/_lib/registry';

import type { TokenStatus } from '@/app/api/_lib/types';

// ---------------- ENV ----------------
const BATCH_SIZE = Number(process.env.RECLASSIFIER_BATCH_SIZE ?? 50);
const MIN_AGE_MINUTES = Number(process.env.RECLASSIFIER_MIN_AGE_MINUTES ?? 30);
const COOLDOWN_HOURS = Number(process.env.RECLASSIFIER_COOLDOWN_HOURS ?? 0.25);

// ---------------- SQL helpers ----------------
type Sql = {
  (strings: TemplateStringsArray, ...values: any[]): Promise<any>;
  unsafe?: (text: string) => Promise<any>;
};

function asRows<T = any>(r: any): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && Array.isArray(r.rows)) return r.rows as T[];
  return [];
}

// ---------------- Lock helpers ----------------
function isLockedDeadcoin(row: any): boolean {
  if (row.status !== 'deadcoin') return false;

  const src =
    row.meta?.source ??
    row.updated_by ??
    null;

  // admin / community deadcoin = HARD LOCK
  if (src === 'admin' || src === 'community') return true;
  if (row.meta?.lock_deadcoin === true) return true;

  return false;
}

// ---------------- Main ----------------
export async function reclassifyAll(
  sql: Sql,
  opts: { force?: boolean } = {}
) {
  // ---- meta tables ----
  await sql`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id serial PRIMARY KEY,
      ran_at timestamptz NOT NULL DEFAULT now(),
      note text
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS token_audit (
      id serial PRIMARY KEY,
      mint text NOT NULL,
      old_status text,
      new_status text,
      price numeric,
      reason text,
      meta jsonb,
      updated_by text,
      ran_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  // ---- cooldown ----
  if (!opts.force) {
    const lastRes = await sql`
      SELECT MAX(ran_at) AS last
      FROM cron_runs
      WHERE note LIKE 'ok:%'
    `;
    const last = asRows<{ last: string | null }>(lastRes)[0]?.last;
    if (last) {
      const blockRes = await sql`
        SELECT (now() - ${last}::timestamptz)
          < (${COOLDOWN_HOURS} * interval '1 hour') AS blocked;
      `;
      if (asRows<{ blocked: boolean }>(blockRes)[0]?.blocked) {
        await sql`INSERT INTO cron_runs (note) VALUES ('skip: cooldown');`;
        return { skipped: true, reason: 'cooldown' as const };
      }
    }
  }

  // ---- advisory lock ----
  const lockRes = await sql`
    SELECT pg_try_advisory_lock(823746) AS got;
  `;
  if (!asRows<{ got: boolean }>(lockRes)[0]?.got) {
    await sql`INSERT INTO cron_runs (note) VALUES ('skip: already_running');`;
    return { skipped: true, reason: 'already_running' as const };
  }

  let processed = 0;
  let changed = 0;

  try {
    // ---- fetch candidates ----
    const rowsRes = await sql`
      SELECT
        mint,
        status,
        updated_at,
        status_at,
        meta,
        updated_by
      FROM token_registry
      WHERE status NOT IN ('blacklist','redlist')
        AND (
          updated_at IS NULL OR
          updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute')
        )
      ORDER BY updated_at NULLS FIRST
      LIMIT ${BATCH_SIZE};
    `;

    const rows = asRows<any>(rowsRes);

    for (const row of rows) {
      processed++;

      const mint = row.mint;
      const oldStatus = row.status as TokenStatus;

      // ---- HARD LOCK ----
      if (!opts.force && isLockedDeadcoin(row)) {
        continue;
      }

      // ---- metrics ----
      let cls;
      try {
        cls = await classifyToken({ mint }, 1);
      } catch {
        continue;
      }

      // 🔧 SAFE metricsCategory mapping
      const metricsCategory: EffectiveStatusInput['metricsCategory'] =
        cls.category === 'healthy' ||
        cls.category === 'walking_dead' ||
        cls.category === 'deadcoin'
          ? cls.category
          : cls.category === 'unknown'
          ? 'deadcoin'
          : null;

      const input: EffectiveStatusInput = {
        registryStatus: oldStatus,
        registrySource: row.meta?.source ?? null,
        metricsCategory,
        usdValue: cls.usdValue ?? 0,
      };

      // ⭐ FINAL DECISION
      const nextStatus = resolveEffectiveStatus(input);

      // ---- no change → touch ----
      if (nextStatus === oldStatus) {
        await sql`
          UPDATE token_registry
          SET updated_at = now()
          WHERE mint = ${mint};
        `;
        continue;
      }

      // ---- write change ----
      await sql`
        UPDATE token_registry
        SET
          status = ${nextStatus}::token_status_enum,
          status_at = now(),
          updated_at = now(),
          meta = COALESCE(meta, '{}'::jsonb) || ${JSON.stringify({
            source: 'cron',
            metrics: {
              category: cls.category,
              liquidity: cls.liquidity,
              volume: cls.volume,
            },
          })}::jsonb
        WHERE mint = ${mint};
      `;

      await sql`
        INSERT INTO token_audit (
          mint,
          old_status,
          new_status,
          price,
          reason,
          meta,
          updated_by
        )
        VALUES (
          ${mint},
          ${oldStatus},
          ${nextStatus},
          ${cls.usdValue ?? null},
          'metrics_reclassification',
          ${JSON.stringify({
            category: cls.category,
            liquidity: cls.liquidity,
            volume: cls.volume,
          })}::jsonb,
          'cron'
        );
      `;

      changed++;
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(823746);`;
  }

  await sql`
    INSERT INTO cron_runs (note)
    VALUES (${`ok: processed=${processed}, changed=${changed}`});
  `;

  return {
    skipped: false as const,
    processed,
    changed,
  };
}
