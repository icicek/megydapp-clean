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
const lit = (x: string | null | number) =>
  x === null || x === undefined ? 'NULL' : `'${String(x).replace(/'/g, "''")}'`;

/** Neon farklı sürümlerde iki şekil döndürebiliyor: rows[] veya {rows:[]}. */
function asRows<T = any>(r: any): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && Array.isArray(r.rows)) return r.rows as T[];
  return [];
}

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
  try {
    // Şema kontrolü
    const colsRes = await sql/* sql */`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=${TABLE};
    `;
    const cols = asRows(colsRes);
    const have = new Set(cols.map((r: any) => r.column_name));
    const need = [COL_MINT, COL_STATUS, COL_UPDATED_AT, COL_STATUS_AT];
    const missing = need.filter(c => !have.has(c));
    if (missing.length > 0) {
      await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`skip: schema_missing:${missing.join(',')}`});`;
      return { skipped: true, reason: 'schema_mismatch', missing, table: TABLE, found: [...have] };
    }

    // Adaylar (dinamik string -> unsafe; sonra normalize)
    const qCandidates = `
      SELECT ${ident(COL_MINT)}  AS mint,
             ${ident(COL_STATUS)} AS status
      FROM ${ident(TABLE)}
      WHERE ${ident(COL_STATUS)} NOT IN ('blacklist','redlist')
        AND (${ident(COL_UPDATED_AT)} IS NULL
             OR ${ident(COL_UPDATED_AT)} < now() - (${MIN_AGE_MINUTES} * interval '1 minute'))
      ORDER BY ${ident(COL_UPDATED_AT)} NULLS FIRST
      LIMIT ${BATCH_SIZE};
    `;
    const candRes = await sql.unsafe(qCandidates);
    const candidates: { mint: string; status: string }[] = asRows(candRes);

    processed = candidates.length;

    // Dokunma (örnek davranış)
    for (const row of candidates) {
      const upd = `
        UPDATE ${ident(TABLE)}
        SET ${ident(COL_UPDATED_AT)} = now()
        WHERE ${ident(COL_MINT)} = ${lit(row.mint)};
      `;
      await sql.unsafe(upd);
      // TODO: gerçek sınıflandırmayı eklediğinde changed++ yap.
    }
  } finally {
    await sql/* sql */`SELECT pg_advisory_unlock(823746);`;
  }

  await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`ok: processed=${processed}, changed=${changed}`});`;
  return { skipped: false, processed, changed };
}
