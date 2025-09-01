// app/api/admin/reclassify/reclassifyAll.ts
import { NextResponse } from 'next/server';

// Optional: read tuning from env
const BATCH_SIZE = Number(process.env.RECLASSIFIER_BATCH_SIZE ?? 50);
const MIN_AGE_MINUTES = Number(process.env.RECLASSIFIER_MIN_AGE_MINUTES ?? 30);
const COOLDOWN_HOURS = Number(process.env.RECLASSIFIER_COOLDOWN_HOURS ?? 1);

// Very small helper for safe dynamic imports (so route can build even if paths move)
async function tryImport<T = any>(path: string): Promise<T | null> {
  try { return (await import(path)) as T; } catch { return null; }
}

export async function reclassifyAll(sql: any) {
  // 0) Ensure tables exist (heartbeat & audit)
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

  // 1) Cooldown
  const last = await sql<{ last: string | null }[]>`
    SELECT MAX(ran_at) AS last FROM cron_runs;
  `;
  if (last[0]?.last) {
    const tooSoon = await sql<{ blocked: boolean }[]>`
      SELECT (now() - ${last[0].last}::timestamptz) < (${COOLDOWN_HOURS} * interval '1 hour') AS blocked;
    `;
    if (tooSoon[0]?.blocked) {
      await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: cooldown');`;
      return { skipped: true, reason: 'cooldown' };
    }
  }

  // 2) Single-run guard (advisory lock)
  const lock = await sql<{ got: boolean }[]>`
    SELECT pg_try_advisory_lock(823746) AS got;
  `;
  if (!lock[0]?.got) {
    await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: already running');`;
    return { skipped: true, reason: 'already_running' };
  }

  let processed = 0, changed = 0;
  try {
    // 3) Fetch candidates (adjust column names if yours differ)
    const candidates = await sql<{ mint: string; status: string }[]>`
      SELECT mint, status
      FROM token_registry
      WHERE status NOT IN ('blacklist','redlist')
        AND (updated_at IS NULL OR updated_at < now() - (${MIN_AGE_MINUTES} * interval '1 minute'))
      ORDER BY updated_at NULLS FIRST
      LIMIT ${BATCH_SIZE};
    `;

    // util imports (fallback to minimal logic if not found)
    const getUsdValueMod = await tryImport<{ default: (m: string) => Promise<number | null> }>('@/app/api/utils/getUsdValue');
    const classifyMod = await tryImport<any>('@/app/api/utils/classifyToken');

    for (const row of candidates) {
      processed++;
      const mint = row.mint;
      let price: number | null = null;
      let newStatus = row.status;

      try {
        price = getUsdValueMod ? await getUsdValueMod.default(mint) : null;
      } catch { /* ignore price errors */ }

      if (classifyMod?.default) {
        // If your classifyToken signature differs, adapt here:
        newStatus = await classifyMod.default({ mint, price, currentStatus: row.status });
      } else {
        // Fallback: very simple rule (replace with your own if needed)
        newStatus = price && price > 0 ? 'healthy' : 'deadcoin';
      }

      if (newStatus !== row.status) {
        await sql.begin(async (trx: any) => {
          await trx/* sql */`
            UPDATE token_registry
            SET status = ${newStatus}, status_at = now(), updated_at = now()
            WHERE mint = ${mint};
          `;
          await trx/* sql */`
            INSERT INTO token_audit (mint, old_status, new_status, price, reason)
            VALUES (${mint}, ${row.status}, ${newStatus}, ${price}, 'reclassify');
          `;
        });
        changed++;
      } else {
        // touch updated_at to mark as checked
        await sql/* sql */`
          UPDATE token_registry SET updated_at = now() WHERE mint = ${mint};
        `;
      }
    }
  } finally {
    await sql/* sql */`SELECT pg_advisory_unlock(823746);`;
  }

  await sql/* sql */`
    INSERT INTO cron_runs (note) VALUES (${`ok: processed=${processed}, changed=${changed}`});
  `;

  return { skipped: false, processed, changed };
}
