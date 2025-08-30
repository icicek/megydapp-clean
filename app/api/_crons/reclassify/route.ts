// app/api/_crons/reclassify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { computeStatusDecision, getEffectiveStatus } from '@/app/api/_lib/registry';
import { setStatus as upsertTokenStatus } from '@/app/api/_lib/token-registry';
import type { TokenStatus } from '@/app/api/_lib/types';
import { getCanonicalMint } from '@/app/api/_lib/aliases';
import { getLatestMetrics } from '@/app/api/_lib/metrics';

type CandidateRow = {
    mint: string;
    status: TokenStatus;
    status_at: string | null;
    updated_at: string;
  };
  
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const urlSecret = req.nextUrl.searchParams.get('secret');
    const headerSecret = req.headers.get('x-cron-secret');
    const isVercelCron = req.headers.get('x-vercel-cron') === '1';
    const cfgSecret = process.env.CRON_SECRET || '';
    
    const authed =
      isVercelCron ||                                  // Vercel Managed Cron çağrısı
      (!!cfgSecret && headerSecret === cfgSecret) ||   // header ile manuel
      (!!cfgSecret && urlSecret === cfgSecret);        // query ile manuel
    
    if (!authed) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

  // 2) Parametreler
  const BATCH = parseInt(process.env.RECLASSIFIER_BATCH_SIZE || '200', 10);
  const MIN_AGE_MIN = parseInt(process.env.RECLASSIFIER_MIN_AGE_MINUTES || '30', 10);
  const COOLDOWN_H = parseInt(process.env.RECLASSIFIER_COOLDOWN_HOURS || '12', 10);

  // 3) Adaylar: son güncellenme süresi eski olanlar, red/black hariç
  const candidates = (await sql`
    SELECT r.mint, r.status::text AS status, r.status_at, r.updated_at
    FROM token_registry r
    WHERE r.status NOT IN ('redlist','blacklist')
      AND r.updated_at < now() - ${MIN_AGE_MIN} * INTERVAL '1 minute'
    ORDER BY r.updated_at ASC
    LIMIT ${BATCH}
  `) as unknown as CandidateRow[];  

  let scanned = 0, changed = 0, promoted = 0, demoted = 0, skippedNoMetrics = 0, aliasUplifts = 0;

  for (const row of candidates) {
    scanned++;

    // cooldown guard: (soft) — zaten MIN_AGE_MIN ile filtreledik; ekstra guard istersen burada da ekleyebilirsin
    if (new Date(row.updated_at).getTime() > Date.now() - COOLDOWN_H*3600*1000) continue;

    // 4) Metrikleri çek (yoksa güvenli şekilde SKIP)
    const m = await getLatestMetrics(row.mint);
    if (!m) { skippedNoMetrics++; continue; }

    // 5) Karar ver
    const decision = computeStatusDecision(m)?.status as TokenStatus;

    // Aynıysa geç
    if (!decision || decision === row.status) continue;

    // 6) Alias uplift: walking_dead → healthy (kanonik mint güçlü ise)
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

    // 7) Güncelle (red/black'a dokunmuyoruz; yukarıda filtreledik)
    await upsertTokenStatus({
      mint: row.mint,
      newStatus: finalDecision,
      changedBy: 'cron:reclassifier',
      reason: uplifted ? 'alias_uplift' : 'reclassifier',
      meta: { usdValue: m.usdValue, volumeUSD: m.volumeUSD ?? null, liquidityUSD: m.liquidityUSD ?? null, aliasUplift: uplifted }
    });

    changed++;
    if (finalDecision === 'healthy') promoted++;
    if (finalDecision === 'deadcoin' || finalDecision === 'walking_dead') demoted++;
  }

  return NextResponse.json({
    ok: true,
    scanned, changed, promoted, demoted, aliasUplifts, skippedNoMetrics,
    batch: BATCH, minAgeMin: MIN_AGE_MIN, cooldownH: COOLDOWN_H
  });
}
