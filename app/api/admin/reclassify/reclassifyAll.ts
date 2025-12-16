// app/api/admin/reclassify/reclassifyAll.ts
// Metrics-aware, registry-aware, LOCK-safe reclassifier (single-source write)

import classifyToken from '@/app/api/utils/classifyToken';
import {
  resolveEffectiveStatus,
  type EffectiveStatusInput,
} from '@/app/api/_lib/registry';

import type { TokenStatus } from '@/app/api/_lib/types';
import { setStatus as setRegistryStatus } from '@/app/api/_lib/token-registry';

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
  if (r && Array.isArray((r as any).rows)) return (r as any).rows as T[];
  return [];
}

function registrySourceFromRow(row: any): string | null {
  return row?.meta?.source ?? row?.updated_by ?? row?.reason ?? null;
}

// ✅ Lock logic MUST match /api/status
function isLockedDeadcoinRow(row: any): boolean {
  if (!row) return false;
  if (row.status !== 'deadcoin') return false;
  const m = row.meta ?? {};
  const src = m?.source ?? row.updated_by ?? null;
  return (
    m?.lock_deadcoin === true ||
    m?.lock?.deadcoin === true ||
    src === 'community' ||
    src === 'admin'
  );
}

function isLockedListRow(row: any): boolean {
  if (!row) return false;
  if (row.status !== 'blacklist' && row.status !== 'redlist') return false;
  const m = row.meta ?? {};
  const src = m?.source ?? row.updated_by ?? null;
  return m?.lock_list === true || src === 'admin';
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

  // ---- cooldown (force bypasses cooldown/age only, NOT locks) ----
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
  const lockRes = await sql`SELECT pg_try_advisory_lock(823746) AS got;`;
  if (!asRows<{ got: boolean }>(lockRes)[0]?.got) {
    await sql`INSERT INTO cron_runs (note) VALUES ('skip: already_running');`;
    return { skipped: true, reason: 'already_running' as const };
  }

  let processed = 0;
  let changed = 0;
  let skippedLocked = 0;
  let skippedMetricsFail = 0;

  try {
    // ---- fetch candidates ----
    // force bypasses age filter only
    const rowsRes = opts.force
      ? await sql`
          SELECT mint, status, updated_at, status_at, meta, updated_by, reason
          FROM token_registry
          WHERE status NOT IN ('blacklist','redlist')
          ORDER BY updated_at NULLS FIRST
          LIMIT ${BATCH_SIZE};
        `
      : await sql`
          SELECT mint, status, updated_at, status_at, meta, updated_by, reason
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

      const mint = row.mint as string;
      const oldStatus = row.status as TokenStatus;

      // ---- HARD LOCKS: never bypass (even with force) ----
      if (isLockedDeadcoinRow(row) || isLockedListRow(row)) {
        skippedLocked++;
        continue;
      }

      // ---- metrics + classification ----
      let cls: any;
      try {
        cls = await classifyToken({ mint }, 1);
      } catch {
        skippedMetricsFail++;
        continue;
      }

      // ✅ metricsCategory mapping: unknown → deadcoin (your rule)
      const metricsCategory: EffectiveStatusInput['metricsCategory'] =
        cls.category === 'healthy' ||
        cls.category === 'walking_dead' ||
        cls.category === 'deadcoin'
          ? cls.category
          : cls.category === 'unknown'
          ? 'deadcoin'
          : null;

      const usdValue = Number(cls.usdValue ?? 0) || 0;

      const input: EffectiveStatusInput = {
        registryStatus: oldStatus,
        registrySource: registrySourceFromRow(row),
        metricsCategory,
        usdValue,
      };

      // ⭐ FINAL DECISION
      const nextStatus = resolveEffectiveStatus(input);

      // ---- no change → touch ----
      if (nextStatus === oldStatus) {
        await sql`UPDATE token_registry SET updated_at = now() WHERE mint = ${mint};`;
        continue;
      }

      // ---- write change (single source write: token-registry.setStatus) ----
      // Preserve existing meta, append cron metrics snapshot (do NOT drop existing lock fields etc.)
      const baseMeta =
        row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
          ? row.meta
          : {};

      const mergedMeta = {
        ...baseMeta,

        // standard stamp for automated changes
        source: 'cron',

        metrics: {
          category: cls.category,
          liquidity: cls.liquidity ?? null,
          volume: cls.volume ?? null,
        },

        reclassified_at: new Date().toISOString(),
      };

      await setRegistryStatus({
        mint,
        newStatus: nextStatus,
        changedBy: 'cron',
        reason: 'metrics_reclassification',
        meta: mergedMeta,
      });

      changed++;
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(823746);`;
  }

  await sql`
    INSERT INTO cron_runs (note)
    VALUES (${`ok: processed=${processed}, changed=${changed}, locked=${skippedLocked}, metricsFail=${skippedMetricsFail}`});
  `;

  return {
    skipped: false as const,
    processed,
    changed,
    skippedLocked,
    skippedMetricsFail,
  };
}
