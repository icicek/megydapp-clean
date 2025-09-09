// app/api/admin/reclassify/reclassifyAll.ts
// SQL-based "deadcoin" + "touch" flow (safe for default schema; dynamic schema via unsafe fallback)

const BATCH_SIZE = Number(process.env.RECLASSIFIER_BATCH_SIZE ?? 50);
const MIN_AGE_MINUTES = Number(process.env.RECLASSIFIER_MIN_AGE_MINUTES ?? 30);
const COOLDOWN_HOURS = Number(process.env.RECLASSIFIER_COOLDOWN_HOURS ?? 0.25);
const DEADCOIN_DAYS = Number(process.env.RECLASSIFIER_DEADCOIN_DAYS ?? 30);

const TABLE = process.env.RECLASSIFIER_TABLE ?? 'token_registry';
const COL_MINT = process.env.RECLASSIFIER_COL_MINT ?? 'mint';
const COL_STATUS = process.env.RECLASSIFIER_COL_STATUS ?? 'status';
const COL_UPDATED_AT = process.env.RECLASSIFIER_COL_UPDATED_AT ?? 'updated_at';
const COL_STATUS_AT = process.env.RECLASSIFIER_COL_STATUS_AT ?? 'status_at';

// Minimal SQL type to tolerate different clients (neon, pg, etc.)
type Sql = {
  (strings: TemplateStringsArray, ...values: any[]): Promise<any>;
  unsafe?: (text: string) => Promise<any>;
};

const ident = (x: string) => `"${String(x).replace(/"/g, '""')}"`;
const lit = (x: string | number | null | undefined) =>
  x === null || x === undefined ? 'NULL' : `'${String(x).replace(/'/g, "''")}'`;

// Normalize result shapes (neon returns arrays; pg may return { rows: [...] })
function asRows<T = any>(r: any): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && Array.isArray(r.rows)) return r.rows as T[];
  return [];
}

const IS_DEFAULT_SCHEMA =
  TABLE === 'token_registry' &&
  COL_MINT === 'mint' &&
  COL_STATUS === 'status' &&
  COL_UPDATED_AT === 'updated_at' &&
  COL_STATUS_AT === 'status_at';

export async function reclassifyAll(sql: Sql, opts: { force?: boolean } = {}) {
  // Meta tables
  await sql/* sql */`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id serial PRIMARY KEY,
      ran_at timestamptz NOT NULL DEFAULT now(),
      note text
    );
  `;
  await sql/* sql */`
    CREATE TABLE IF NOT EXISTS token_audit (
      id serial PRIMARY KEY,
      mint text NOT NULL,
      old_status text,
      new_status text,
      price numeric,
      reason text,
      ran_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  // Cooldown guard (skip if recent "ok" run and not forced)
  if (!opts.force) {
    const lastOkRes = await sql/* sql */`
      SELECT MAX(ran_at) AS last FROM cron_runs
      WHERE note IS NULL OR note LIKE 'ok:%';
    `;
    const lastOk = asRows<{ last: string | null }>(lastOkRes)[0]?.last;
    if (lastOk) {
      const blockedRes = await sql/* sql */`
        SELECT (now() - ${lastOk}::timestamptz) < (${COOLDOWN_HOURS} * interval '1 hour') AS blocked;
      `;
      const blocked = asRows<{ blocked: boolean }>(blockedRes)[0]?.blocked;
      if (blocked) {
        await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: cooldown');`;
        return { skipped: true, reason: 'cooldown' as const };
      }
    }
  }

  // Single-run guard (advisory lock)
  const lockRes = await sql/* sql */`SELECT pg_try_advisory_lock(823746) AS got;`;
  const gotLock = asRows<{ got: boolean }>(lockRes)[0]?.got;
  if (!gotLock) {
    await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: already_running');`;
    return { skipped: true, reason: 'already_running' as const };
  }

  let processed = 0;
  let changed = 0;
  let metrics: Record<string, number> = {};
  try {
    // Schema sanity check
    const colsRes = await sql/* sql */`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=${TABLE};
    `;
    const haveCols = new Set(asRows<{ column_name: string }>(colsRes).map(r => r.column_name));
    const needCols = [COL_MINT, COL_STATUS, COL_UPDATED_AT, COL_STATUS_AT];
    const missing = needCols.filter(c => !haveCols.has(c));
    if (missing.length > 0) {
      await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`skip: schema_missing:${missing.join(',')}`});`;
      return { skipped: true, reason: 'schema_mismatch' as const, missing, table: TABLE, found: Array.from(haveCols) };
    }

    // Metrics (optional, helpful in logs)
    if (IS_DEFAULT_SCHEMA) {
      const totalRes    = await sql/* sql */`SELECT COUNT(*)::int AS n FROM token_registry;`;
      const eligibleRes = await sql/* sql */`
        SELECT COUNT(*)::int AS n FROM token_registry
        WHERE status NOT IN ('blacklist','redlist');
      `;
      const staleRes    = await sql/* sql */`
        SELECT COUNT(*)::int AS n FROM token_registry
        WHERE updated_at IS NULL
           OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute');
      `;
      const bothRes     = await sql/* sql */`
        SELECT COUNT(*)::int AS n FROM token_registry
        WHERE status NOT IN ('blacklist','redlist')
          AND (updated_at IS NULL
               OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute'));
      `;
      const total    = asRows<{ n: number }>(totalRes)[0]?.n ?? 0;
      const eligible = asRows<{ n: number }>(eligibleRes)[0]?.n ?? 0;
      const stale    = asRows<{ n: number }>(staleRes)[0]?.n ?? 0;
      const both     = asRows<{ n: number }>(bothRes)[0]?.n ?? 0;
      metrics = { total, eligible, stale, eligible_and_stale: both };
    } else {
      const q = (s: string) => sql.unsafe ? sql.unsafe(s) : sql([s] as any);
      const totalRes    = await q(`SELECT COUNT(*)::int AS n FROM ${ident(TABLE)};`);
      const eligibleRes = await q(`
        SELECT COUNT(*)::int AS n FROM ${ident(TABLE)}
        WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist');
      `);
      const staleRes    = await q(`
        SELECT COUNT(*)::int AS n FROM ${ident(TABLE)}
        WHERE ${ident(COL_UPDATED_AT)} IS NULL
           OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute');
      `);
      const bothRes     = await q(`
        SELECT COUNT(*)::int AS n FROM ${ident(TABLE)}
        WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist')
          AND (${ident(COL_UPDATED_AT)} IS NULL
               OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute'));
      `);
      const total    = asRows<{ n: number }>(totalRes)[0]?.n ?? 0;
      const eligible = asRows<{ n: number }>(eligibleRes)[0]?.n ?? 0;
      const stale    = asRows<{ n: number }>(staleRes)[0]?.n ?? 0;
      const both     = asRows<{ n: number }>(bothRes)[0]?.n ?? 0;
      metrics = { total, eligible, stale, eligible_and_stale: both };
    }

    // ---------- 1) DEADCOIN stage (SQL) ----------
    if (IS_DEFAULT_SCHEMA) {
      const deadcoinRes = await sql/* sql */`
        WITH to_dead AS (
          SELECT mint, status AS old_status
          FROM token_registry
          WHERE status NOT IN ('blacklist','redlist','deadcoin')
            AND (updated_at IS NULL
                 OR updated_at < now() - (${DEADCOIN_DAYS} * interval '1 day'))
          ORDER BY updated_at NULLS FIRST
          LIMIT ${BATCH_SIZE}
        ),
        upd AS (
          UPDATE token_registry t
          SET status = 'deadcoin',
              status_at = now(),
              updated_at = now()
          FROM to_dead d
          WHERE t.mint = d.mint
          RETURNING d.mint, d.old_status
        )
        INSERT INTO token_audit (mint, old_status, new_status, price, reason)
        SELECT mint, old_status, 'deadcoin', NULL, ${`stale>${DEADCOIN_DAYS}d`}
        FROM upd
        RETURNING mint;
      `;
      changed = asRows(deadcoinRes).length;
    } else {
      const q = (s: string) => sql.unsafe ? sql.unsafe(s) : sql([s] as any);
      const deadcoinRes = await q(`
        WITH to_dead AS (
          SELECT ${ident(COL_MINT)} AS mint, ${ident(COL_STATUS)} AS old_status
          FROM ${ident(TABLE)}
          WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist','deadcoin')
            AND (${ident(COL_UPDATED_AT)} IS NULL
                 OR ${ident(COL_UPDATED_AT)} < now() - (${DEADCOIN_DAYS} * interval '1 day'))
          ORDER BY ${ident(COL_UPDATED_AT)} NULLS FIRST
          LIMIT ${BATCH_SIZE}
        ),
        upd AS (
          UPDATE ${ident(TABLE)} t
          SET ${ident(COL_STATUS)}='deadcoin',
              ${ident(COL_STATUS_AT)}=now(),
              ${ident(COL_UPDATED_AT)}=now()
          FROM to_dead d
          WHERE t.${ident(COL_MINT)} = d.mint
          RETURNING d.mint, d.old_status
        )
        INSERT INTO token_audit (mint, old_status, new_status, price, reason)
        SELECT mint, old_status, 'deadcoin', NULL, ${lit(`stale>${DEADCOIN_DAYS}d`)}
        FROM upd
        RETURNING mint;
      `);
      changed = asRows(deadcoinRes).length;
    }

    // ---------- 2) TOUCH stage (updated_at = now) ----------
    // If you don't care about exceeding BATCH_SIZE overall, you can run a full second batch.
    // This version uses remaining capacity after deadcoin UPDATEs:
    const TOUCH_LIMIT = Math.max(0, BATCH_SIZE - changed);

    if (TOUCH_LIMIT > 0) {
      if (IS_DEFAULT_SCHEMA) {
        const touchRes = await sql/* sql */`
          WITH to_touch AS (
            SELECT mint
            FROM token_registry
            WHERE status NOT IN ('blacklist','redlist','deadcoin')
              AND (updated_at IS NULL
                   OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute'))
            ORDER BY updated_at NULLS FIRST
            LIMIT ${TOUCH_LIMIT}
          )
          UPDATE token_registry t
          SET updated_at = now()
          FROM to_touch s
          WHERE t.mint = s.mint
          RETURNING t.mint;
        `;
        processed = changed + asRows(touchRes).length;
      } else {
        const q = (s: string) => sql.unsafe ? sql.unsafe(s) : sql([s] as any);
        const touchRes = await q(`
          WITH to_touch AS (
            SELECT ${ident(COL_MINT)} AS mint
            FROM ${ident(TABLE)}
            WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist','deadcoin')
              AND (${ident(COL_UPDATED_AT)} IS NULL
                   OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute'))
            ORDER BY ${ident(COL_UPDATED_AT)} NULLS FIRST
            LIMIT ${TOUCH_LIMIT}
          )
          UPDATE ${ident(TABLE)} t
          SET ${ident(COL_UPDATED_AT)} = now()
          FROM to_touch s
          WHERE t.${ident(COL_MINT)} = s.mint
          RETURNING t.${ident(COL_MINT)} AS mint;
        `);
        processed = changed + asRows(touchRes).length;
      }
    } else {
      processed = changed;
    }
  } finally {
    await sql/* sql */`SELECT pg_advisory_unlock(823746);`;
  }

  await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`ok: processed=${processed}, changed=${changed}`});`;
  return {
    skipped: false as const,
    processed,
    changed,
    metrics: { ...metrics, deadcoin_days: DEADCOIN_DAYS }
  };
}
