// app/api/admin/reclassify/reclassifyAll.ts

const BATCH_SIZE = Number(process.env.RECLASSIFIER_BATCH_SIZE ?? 50);
const MIN_AGE_MINUTES = Number(process.env.RECLASSIFIER_MIN_AGE_MINUTES ?? 30);
const COOLDOWN_HOURS = Number(process.env.RECLASSIFIER_COOLDOWN_HOURS ?? 0.25);

const TABLE = process.env.RECLASSIFIER_TABLE ?? 'token_registry';
const COL_MINT = process.env.RECLASSIFIER_COL_MINT ?? 'mint';
const COL_STATUS = process.env.RECLASSIFIER_COL_STATUS ?? 'status';
const COL_UPDATED_AT = process.env.RECLASSIFIER_COL_UPDATED_AT ?? 'updated_at';
const COL_STATUS_AT = process.env.RECLASSIFIER_COL_STATUS_AT ?? 'status_at';

type Sql = any;

const ident = (x: string) => `"${String(x).replace(/"/g, '""')}"`;
const lit = (x: string | number | null | undefined) =>
  x === null || x === undefined ? 'NULL' : `'${String(x).replace(/'/g, "''")}'`;

function asRows<T = any>(r: any): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && Array.isArray(r.rows)) return r.rows as T[];
  return [];
}

// Varsayılan isimler mi?
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

  // Cooldown (sadece ok:%)
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
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${TABLE};
    `;
    const have = new Set(asRows(colsRes).map((r: any) => r.column_name));
    const need = [COL_MINT, COL_STATUS, COL_UPDATED_AT, COL_STATUS_AT];
    const missing = need.filter(c => !have.has(c));
    if (missing.length > 0) {
      await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`skip: schema_missing:${missing.join(',')}`});`;
      return { skipped: true, reason: 'schema_mismatch', missing, table: TABLE, found: [...have] };
    }

    // Metrikler (teşhis için)
    if (IS_DEFAULT_SCHEMA) {
      const total    = (await sql/* sql */`SELECT COUNT(*)::int AS n FROM token_registry;`)[0]?.n ?? 0;
      const eligible = (await sql/* sql */`
        SELECT COUNT(*)::int AS n
        FROM token_registry
        WHERE status NOT IN ('blacklist','redlist');
      `)[0]?.n ?? 0;
      const stale    = (await sql/* sql */`
        SELECT COUNT(*)::int AS n
        FROM token_registry
        WHERE updated_at IS NULL
           OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute');
      `)[0]?.n ?? 0;
      const both     = (await sql/* sql */`
        SELECT COUNT(*)::int AS n
        FROM token_registry
        WHERE status NOT IN ('blacklist','redlist')
          AND (updated_at IS NULL
               OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute'));
      `)[0]?.n ?? 0;
      metrics = { total, eligible, stale, eligible_and_stale: both };
    } else {
      const q = (s: string) => sql.unsafe(s);
      const total    = asRows(await q(`SELECT COUNT(*)::int AS n FROM ${ident(TABLE)};`))[0]?.n ?? 0;
      const eligible = asRows(await q(`
        SELECT COUNT(*)::int AS n
        FROM ${ident(TABLE)}
        WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist');
      `))[0]?.n ?? 0;
      const stale    = asRows(await q(`
        SELECT COUNT(*)::int AS n
        FROM ${ident(TABLE)}
        WHERE ${ident(COL_UPDATED_AT)} IS NULL
           OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute');
      `))[0]?.n ?? 0;
      const both     = asRows(await q(`
        SELECT COUNT(*)::int AS n
        FROM ${ident(TABLE)}
        WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist')
          AND (${ident(COL_UPDATED_AT)} IS NULL
               OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute'));
      `))[0]?.n ?? 0;
      metrics = { total, eligible, stale, eligible_and_stale: both };
    }

    // Adayları al
    let candidates: { mint: string; status: string }[] = [];
    if (IS_DEFAULT_SCHEMA) {
      candidates = await sql/* sql */`
        SELECT mint, status
        FROM token_registry
        WHERE status NOT IN ('blacklist','redlist')
          AND (updated_at IS NULL
               OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute'))
        ORDER BY updated_at NULLS FIRST
        LIMIT ${BATCH_SIZE};
      `;
    } else {
      const qCandidates = `
        SELECT ${ident(COL_MINT)} AS mint,
               ${ident(COL_STATUS)} AS status
        FROM ${ident(TABLE)}
        WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist')
          AND (${ident(COL_UPDATED_AT)} IS NULL
               OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute'))
        ORDER BY ${ident(COL_UPDATED_AT)} NULLS FIRST
        LIMIT ${BATCH_SIZE};
      `;
      candidates = asRows(await sql.unsafe(qCandidates));
    }

    processed = candidates.length;

    // Şimdilik sadece "dokun" (updated_at = now())
    for (const row of candidates) {
      if (IS_DEFAULT_SCHEMA) {
        await sql/* sql */`
          UPDATE token_registry
          SET updated_at = now()
          WHERE mint = ${row.mint};
        `;
      } else {
        const upd = `
          UPDATE ${ident(TABLE)}
          SET ${ident(COL_UPDATED_AT)} = now()
          WHERE ${ident(COL_MINT)} = ${lit(row.mint)};
        `;
        await sql.unsafe(upd);
      }
    }
  } finally {
    await sql/* sql */`SELECT pg_advisory_unlock(823746);`;
  }

  await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`ok: processed=${processed}, changed=${changed}`});`;
  return { skipped: false, processed, changed, metrics };
}
