// app/api/crons/reclassify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { computeStatusDecision, getEffectiveStatus } from '@/app/api/_lib/registry';
import { setStatus as upsertTokenStatus } from '@/app/api/_lib/token-registry';
import type { TokenStatus } from '@/app/api/_lib/types';
import { getCanonicalMint } from '@/app/api/_lib/aliases';
import { getLatestMetrics } from '@/app/api/_lib/metrics';
import { requireCronEnabled } from '@/app/api/_lib/feature-flags';
import { HttpError } from '@/app/api/_lib/jwt';

type CandidateRow = {
  mint: string;
  status: TokenStatus;
  status_at: string | null;
  updated_at: string;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ---------- helpers ---------- */
function asRows<T = any>(r: any): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r?.rows) return r.rows as T[];
  return [];
}
async function ensureCronTables() {
  await sql/* sql */`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id serial PRIMARY KEY,
      ran_at timestamptz NOT NULL DEFAULT now(),
      note text
    );
  `;
}
async function tryLock(key: number): Promise<boolean> {
  const r = asRows(await sql/* sql */`SELECT pg_try_advisory_lock(${key}) AS got;`);
  return !!r[0]?.got;
}
async function unlock(key: number): Promise<void> {
  await sql/* sql */`SELECT pg_advisory_unlock(${key});`;
}
async function globalCooldownActive(minutes: number): Promise<boolean> {
  if (!minutes || minutes <= 0) return false;
  const r = asRows(await sql/* sql */`
    SELECT (now() - COALESCE(MAX(ran_at), 'epoch'::timestamptz))
           < (${minutes} * interval '1 minute') AS blocked
    FROM cron_runs
    WHERE note LIKE 'ok:%' OR note LIKE 'skip:%';
  `);
  return !!r[0]?.blocked;
}

/* ---------- handler ---------- */
export async function GET(req: NextRequest) {
  // Tunables
  const BATCH       = Number(process.env.RECLASSIFIER_BATCH_SIZE ?? '200');
  const MIN_AGE_MIN = Number(process.env.RECLASSIFIER_MIN_AGE_MINUTES ?? '30');
  const COOLDOWN_H  = Number(process.env.RECLASSIFIER_COOLDOWN_HOURS ?? '12');
  const GLOBAL_CD_M = Number(process.env.RECLASSIFIER_GLOBAL_COOLDOWN_MIN ?? '5'); // opsiyonel

  const dryRun = req.nextUrl.searchParams.get('dry') === '1';
  const force  =
    req.headers.get('x-cron-force') === '1' || req.nextUrl.searchParams.get('force') === '1';

  try {
    // 0) Global kill-switch
    await requireCronEnabled();

    // 1) Auth (Vercel Cron UA veya SECRET)
    const urlSecret   = req.nextUrl.searchParams.get('secret');
    const headerSecret= req.headers.get('x-cron-secret');
    const ua          = req.headers.get('user-agent') || '';
    const isVercelCron= /\bvercel-cron\/1\.0\b/i.test(ua);
    const cfgSecret   = process.env.CRON_SECRET || '';

    const authed =
      isVercelCron ||
      (!!cfgSecret && headerSecret === cfgSecret) ||
      (!!cfgSecret && urlSecret === cfgSecret);
    if (!authed) {
      return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
    }

    // 2) Global lock + cooldown
    await ensureCronTables();

    const LOCK_KEY = 823745;
    const got = await tryLock(LOCK_KEY);
    if (!got) {
      await sql/* sql */`INSERT INTO cron_runs (note) VALUES ('skip: already_running');`;
      return NextResponse.json({ ok:true, skipped:true, reason:'already_running' }, { status:200 });
    }

    try {
      if (!force && (await globalCooldownActive(GLOBAL_CD_M))) {
        await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`skip: cooldown<${GLOBAL_CD_M}m`});`;
        return NextResponse.json({
          ok:true, skipped:true, reason:'cooldown', globalCooldownMin: GLOBAL_CD_M
        });
      }

      // 3) Adaylar: red/black hariç, en eski updated
      const candidates = (await sql/* sql */`
        SELECT r.mint, r.status::text AS status, r.status_at, r.updated_at
        FROM token_registry r
        WHERE r.status NOT IN ('redlist','blacklist')
          AND r.updated_at < now() - ${MIN_AGE_MIN} * INTERVAL '1 minute'
        ORDER BY r.updated_at ASC
        LIMIT ${BATCH}
      `) as unknown as CandidateRow[];

      let scanned=0, changed=0, promoted=0, demoted=0, skippedNoMetrics=0, aliasUplifts=0;

      for (const row of candidates) {
        scanned++;

        // Soft cooldown per-row
        const cooldownMs = COOLDOWN_H * 3600 * 1000;
        if (new Date(row.updated_at).getTime() > Date.now() - cooldownMs) continue;

        const m = await getLatestMetrics(row.mint);
        if (!m) { skippedNoMetrics++; continue; }

        const decision = computeStatusDecision(m)?.status as TokenStatus | undefined;
        if (!decision || decision === row.status) continue;

        let uplifted = false;
        let finalDecision: TokenStatus = decision;

        if (decision === 'walking_dead') {
          const canonical = await getCanonicalMint(row.mint);
          if (canonical) {
            const canonicalStatus = await getEffectiveStatus(canonical);
            if (canonicalStatus === 'healthy') {
              finalDecision = 'healthy';
              uplifted = true;
              aliasUplifts++;
            }
          }
        }

        if (!dryRun) {
          await upsertTokenStatus({
            mint: row.mint,
            newStatus: finalDecision,
            changedBy: 'cron:reclassifier',
            reason: uplifted ? 'alias_uplift' : 'reclassifier',
            meta: {
              usdValue: m.usdValue,
              volumeUSD: m.volumeUSD ?? null,
              liquidityUSD: m.liquidityUSD ?? null,
              aliasUplift: uplifted,
            },
          });
        }

        changed++;
        if (finalDecision === 'healthy') promoted++;
        if (finalDecision === 'deadcoin' || finalDecision === 'walking_dead') demoted++;
      }

      await sql/* sql */`INSERT INTO cron_runs (note) VALUES (${`ok: scanned=${scanned}, changed=${changed}`});`;

      return NextResponse.json({
        ok: true,
        dryRun,                           // <-- eklendi
        scanned, changed, promoted, demoted, aliasUplifts, skippedNoMetrics,
        batch: BATCH, minAgeMin: MIN_AGE_MIN, cooldownH: COOLDOWN_H,
        globalCooldownMin: GLOBAL_CD_M,   // <-- eklendi
      });      
    } finally {
      await unlock(LOCK_KEY);
    }
  } catch (err: unknown) {
    const status = (err as any)?.statusCode ?? (err as any)?.status ?? 500;
    const message = err instanceof Error ? err.message : 'internal_error';
    if (!(err as any instanceof HttpError)) console.error('cron reclassify error:', err);
    return NextResponse.json({ ok:false, error:message }, { status });
  }
}
