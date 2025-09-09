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

// Helper: map error to HTTP status safely
function httpStatus(err: unknown): number {
  const e = err as any;
  if (e && typeof e === 'object') {
    if (typeof e.statusCode === 'number') return e.statusCode;
    if (typeof e.status === 'number') return e.status;
  }
  return 500;
}

export async function GET(req: NextRequest) {
  try {
    // 0) Global cron guard
    await requireCronEnabled();

    // 1) Auth for cron trigger (Vercel Managed Cron OR secret via header/query)
    const urlSecret = req.nextUrl.searchParams.get('secret');
    const headerSecret = req.headers.get('x-cron-secret');
    const isVercelCron = req.headers.get('x-vercel-cron') === '1';
    const cfgSecret = process.env.CRON_SECRET || '';

    const authed =
      isVercelCron ||
      (!!cfgSecret && headerSecret === cfgSecret) ||
      (!!cfgSecret && urlSecret === cfgSecret);

    if (!authed) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // 2) Params
    const BATCH = Number(process.env.RECLASSIFIER_BATCH_SIZE ?? '200');
    const MIN_AGE_MIN = Number(process.env.RECLASSIFIER_MIN_AGE_MINUTES ?? '30');
    const COOLDOWN_H = Number(process.env.RECLASSIFIER_COOLDOWN_HOURS ?? '12');

    // 3) Candidates: exclude red/black; prefer oldest updated
    const candidates = (await sql`
      SELECT r.mint, r.status::text AS status, r.status_at, r.updated_at
      FROM token_registry r
      WHERE r.status NOT IN ('redlist','blacklist')
        AND r.updated_at < now() - ${MIN_AGE_MIN} * INTERVAL '1 minute'
      ORDER BY r.updated_at ASC
      LIMIT ${BATCH}
    `) as unknown as CandidateRow[];

    let scanned = 0;
    let changed = 0;
    let promoted = 0;
    let demoted = 0;
    let skippedNoMetrics = 0;
    let aliasUplifts = 0;

    for (const row of candidates) {
      scanned++;

      // Soft cooldown guard (extra safety)
      const updatedAtMs = new Date(row.updated_at).getTime();
      const cooldownMs = COOLDOWN_H * 3600 * 1000;
      if (updatedAtMs > Date.now() - cooldownMs) continue;

      // 4) Fetch latest metrics; skip safely if unavailable
      const m = await getLatestMetrics(row.mint);
      if (!m) {
        skippedNoMetrics++;
        continue;
      }

      // 5) Decide status
      const decision = computeStatusDecision(m)?.status as TokenStatus | undefined;

      // Same or no decision → skip
      if (!decision || decision === row.status) continue;

      // 6) Alias uplift: walking_dead → healthy if canonical is healthy
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

      // 7) Update (red/black excluded above)
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

      changed++;
      if (finalDecision === 'healthy') promoted++;
      if (finalDecision === 'deadcoin' || finalDecision === 'walking_dead') demoted++;
    }

    return NextResponse.json({
      ok: true,
      scanned,
      changed,
      promoted,
      demoted,
      aliasUplifts,
      skippedNoMetrics,
      batch: BATCH,
      minAgeMin: MIN_AGE_MIN,
      cooldownH: COOLDOWN_H,
    });
  } catch (err: unknown) {
    // Map to status without relying on a specific property name
    const status = err instanceof HttpError ? httpStatus(err) : httpStatus(err);
    const message = err instanceof Error ? err.message : 'internal_error';
    if (!(err instanceof HttpError)) {
      console.error('cron reclassify error:', err);
    }
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
