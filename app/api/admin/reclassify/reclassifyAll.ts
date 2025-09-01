// app/api/admin/reclassify/reclassifyAll.ts
// Minimal, güvenli iskelet: cooldown, lock, audit; gerçek iş mantığını sonra doldururuz.
const BATCH_SIZE = Number(process.env.RECLASSIFIER_BATCH_SIZE ?? 50);
const MIN_AGE_MINUTES = Number(process.env.RECLASSIFIER_MIN_AGE_MINUTES ?? 30);
const COOLDOWN_HOURS = Number(process.env.RECLASSIFIER_COOLDOWN_HOURS ?? 1);

type Sql = any;

export async function reclassifyAll(sql: Sql, opts: { force?: boolean } = {}) {
  // 0) Tablo hazırla
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

  // 1) Cooldown (yalnızca "başarılı" çalışmaları dikkate al)
  if (!opts.force) {
    const lastOk = await sql<{ last: string | null }[]>`
      SELECT MAX(ran_at) AS last
      FROM cron_runs
      WHERE note IS NULL OR note LIKE 'ok:%'
    `;
    if (lastOk[0]?.last) {
      const blocked = await sql<{ blocked: boolean }[]>`
        SELECT (now() - ${lastOk[0].last}::timestamptz) < (${COOLDOWN_HOURS} * interval '1 hour') AS blocked;
      `;
      if (blocked[0]?.blocked) {
        await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: cooldown');`;
        return { skipped: true, reason: 'cooldown' };
      }
    }
  }

  // 2) Tekil çalıştırma (advisory lock)
  const lock = await sql<{ got: boolean }[]>`SELECT pg_try_advisory_lock(823746) AS got;`;
  if (!lock[0]?.got) {
    await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: already_running');`;
    return { skipped: true, reason: 'already_running' };
  }

  let processed = 0, changed = 0;
  try {
    // 3) Adayları al (kendi şemana göre düzenle)
    // Şeman yoksa bu blok hiç hata vermesin diye en basit haline bıraktım:
    const candidates: { mint: string; status: string }[] = [];
    // TODO: gerçek sorgunu buraya ekle:
    // const candidates = await sql`SELECT ... FROM token_registry WHERE ... LIMIT ${BATCH_SIZE};`;

    for (const row of candidates) {
      processed++;
      const mint = row.mint;
      const newStatus = row.status; // TODO: mevcut sınıflandırma mantığını ekle

      // Değişmediyse sadece dokun
      await sql/* sql */`
        UPDATE token_registry SET updated_at = now() WHERE mint = ${mint};
      `;
      // Eğer değişecekse:
      // await sql.begin(async (trx: any) => {
      //   await trx`UPDATE token_registry SET status=${newStatus}, status_at=now(), updated_at=now() WHERE mint=${mint};`;
      //   await trx`INSERT INTO token_audit (mint, old_status, new_status, price, reason) VALUES (${mint}, ${row.status}, ${newStatus}, ${null}, 'reclassify');`;
      // });
      // changed++;
    }
  } finally {
    await sql/* sql */`SELECT pg_advisory_unlock(823746);`;
  }

  await sql/* sql */`
    INSERT INTO cron_runs (note) VALUES (${`ok: processed=${processed}, changed=${changed}`});
  `;

  return { skipped: false, processed, changed };
}
