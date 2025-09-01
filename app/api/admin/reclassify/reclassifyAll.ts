// app/api/admin/reclassify/reclassifyAll.ts
// SQL-tabanlı "deadcoin" + "touch" akışı (default şema için tam güvenli, dinamik şema için unsafe fallback)

const BATCH_SIZE = Number(process.env.RECLASSIFIER_BATCH_SIZE ?? 50);
const MIN_AGE_MINUTES = Number(process.env.RECLASSIFIER_MIN_AGE_MINUTES ?? 30);
const COOLDOWN_HOURS = Number(process.env.RECLASSIFIER_COOLDOWN_HOURS ?? 0.25);
const DEADCOIN_DAYS = Number(process.env.RECLASSIFIER_DEADCOIN_DAYS ?? 30);

const TABLE = process.env.RECLASSIFIER_TABLE ?? 'token_registry';
const COL_MINT = process.env.RECLASSIFIER_COL_MINT ?? 'mint';
const COL_STATUS = process.env.RECLASSIFIER_COL_STATUS ?? 'status';
const COL_UPDATED_AT = process.env.RECLASSIFIER_COL_UPDATED_AT ?? 'updated_at';
const COL_STATUS_AT = process.env.RECLASSIFIER_COL_STATUS_AT ?? 'status_at';

type Sql = any;
const ident = (x: string) => `"${String(x).replace(/"/g, '""')}"`;
const lit = (x: string | number | null | undefined) =>
  x === null || x === undefined ? 'NULL' : `'${String(x).replace(/'/g, "''")}'`;
function asRows<T = any>(r: any): T[] { if (Array.isArray(r)) return r; if (r?.rows) return r.rows; return []; }

const IS_DEFAULT_SCHEMA =
  TABLE === 'token_registry' &&
  COL_MINT === 'mint' &&
  COL_STATUS === 'status' &&
  COL_UPDATED_AT === 'updated_at' &&
  COL_STATUS_AT === 'status_at';

export async function reclassifyAll(sql: Sql, opts: { force?: boolean } = {}) {
  // Meta tablolar
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

  // Cooldown
  if (!opts.force) {
    const lastOk = await sql/* sql */`
      SELECT MAX(ran_at) AS last FROM cron_runs
      WHERE note IS NULL OR note LIKE 'ok:%';
    `;
    const last = lastOk[0]?.last;
    if (last) {
      const blocked = await sql/* sql */`
        SELECT (now() - ${last}::timestamptz) < (${COOLDOWN_HOURS} * interval '1 hour') AS blocked;
      `;
      if (blocked[0]?.blocked) {
        await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: cooldown');`;
        return { skipped: true, reason: 'cooldown' };
      }
    }
  }

  // Tekil çalıştırma
  const lock = await sql/* sql */`SELECT pg_try_advisory_lock(823746) AS got;`;
  if (!lock[0]?.got) {
    await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: already_running');`;
    return { skipped: true, reason: 'already_running' };
  }

  let processed = 0, changed = 0;
  let metrics: any = {};
  try {
    // Şema kontrolü
    const colsRes = await sql/* sql */`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=${TABLE};
    `;
    const have = new Set(asRows(colsRes).map((r: any) => r.column_name));
    const need = [COL_MINT, COL_STATUS, COL_UPDATED_AT, COL_STATUS_AT];
    const missing = need.filter(c => !have.has(c));
    if (missing.length > 0) {
      await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`skip: schema_missing:${missing.join(',')}`});`;
      return { skipped: true, reason: 'schema_mismatch', missing, table: TABLE, found: [...have] };
    }

    // Metrikler
    if (IS_DEFAULT_SCHEMA) {
      const total    = (await sql/* sql */`SELECT COUNT(*)::int AS n FROM token_registry;`)[0]?.n ?? 0;
      const eligible = (await sql/* sql */`
        SELECT COUNT(*)::int AS n FROM token_registry
        WHERE status NOT IN ('blacklist','redlist');
      `)[0]?.n ?? 0;
      const stale    = (await sql/* sql */`
        SELECT COUNT(*)::int AS n FROM token_registry
        WHERE updated_at IS NULL
           OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute');
      `)[0]?.n ?? 0;
      const both     = (await sql/* sql */`
        SELECT COUNT(*)::int AS n FROM token_registry
        WHERE status NOT IN ('blacklist','redlist')
          AND (updated_at IS NULL
               OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute'));
      `)[0]?.n ?? 0;
      metrics = { total, eligible, stale, eligible_and_stale: both };
    } else {
      const q = (s: string) => sql.unsafe(s);
      const total    = asRows(await q(`SELECT COUNT(*)::int AS n FROM ${ident(TABLE)};`))[0]?.n ?? 0;
      const eligible = asRows(await q(`
        SELECT COUNT(*)::int AS n FROM ${ident(TABLE)}
        WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist');
      `))[0]?.n ?? 0;
      const stale    = asRows(await q(`
        SELECT COUNT(*)::int AS n FROM ${ident(TABLE)}
        WHERE ${ident(COL_UPDATED_AT)} IS NULL
           OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute');
      `))[0]?.n ?? 0;
      const both     = asRows(await q(`
        SELECT COUNT(*)::int AS n FROM ${ident(TABLE)}
        WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist')
          AND (${ident(COL_UPDATED_AT)} IS NULL
               OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute'));
      `))[0]?.n ?? 0;
      metrics = { total, eligible, stale, eligible_and_stale: both };
    }

    // ---------- 1) DEADCOIN aşaması (SQL ile) ----------
    if (IS_DEFAULT_SCHEMA) {
      const deadcoinRows = await sql/* sql */`
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
      changed = deadcoinRows.length;
    } else {
      const q = (s: string) => sql.unsafe(s);
      const deadcoinRows = asRows(await q(`
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
      `));
      changed = deadcoinRows.length;
    }

    // ---------- 2) TOUCH aşaması (updated_at = now) ----------
    // BATCH_SIZE'in aşılıp aşılmamasını dert etmiyorsan direkt ikinci bir BATCH daha dokunabilir.
    // İstersen kalan kapasiteyi kullanmak için şu satırı aktif et:
    const TOUCH_LIMIT = Math.max(0, BATCH_SIZE - changed);

    if (TOUCH_LIMIT > 0) {
      if (IS_DEFAULT_SCHEMA) {
        const touchRows = await sql/* sql */`
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
        processed = changed + touchRows.length;
      } else {
        const q = (s: string) => sql.unsafe(s);
        const touchRows = asRows(await q(`
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
        `));
        processed = changed + touchRows.length;
      }
    } else {
      processed = changed;
    }

  } finally {
    await sql/* sql */`SELECT pg_advisory_unlock(823746);`;
  }

  await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`ok: processed=${processed}, changed=${changed}`});`;
  return { skipped: false, processed, changed, metrics: { ...metrics, deadcoin_days: DEADCOIN_DAYS } };
}
