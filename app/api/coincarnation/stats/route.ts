// app/api/coincarnation/stats/route.ts
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  getStatusRow,
  type TokenStatus,
} from '@/app/api/_lib/registry';

export const revalidate = 30;
export const runtime = 'nodejs';

function getSql() {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Missing database connection string');
  }
  return neon(url);
}

async function isDeadcoinForMegy(
  mint: string | null | undefined,
  usd: number,
  cache: Map<string, TokenStatus | null>,
): Promise<boolean> {
  if (!Number.isFinite(usd) || usd === 0) return true;
  if (!mint) return false;

  if (cache.has(mint)) {
    const s = cache.get(mint);
    return s === 'deadcoin';
  }

  try {
    const reg = await getStatusRow(mint);
    const status = (reg?.status ?? null) as TokenStatus | null;
    cache.set(mint, status);
    return status === 'deadcoin';
  } catch (e) {
    console.warn(
      '[stats] getStatusRow failed, treating as non-deadcoin:',
      (e as any)?.message || e,
    );
    cache.set(mint, null);
    return false;
  }
}

export async function GET() {
  try {
    const sql = getSql();

    const participantResult = await sql`
      SELECT COUNT(DISTINCT wallet_address) AS count
      FROM contributions;
    ` as any[];

    const contribRows = await sql`
      SELECT token_contract, usd_value
      FROM contributions
    ` as any[];

    const distinctMintRows = await sql`
      SELECT DISTINCT token_contract
      FROM contributions
      WHERE token_contract IS NOT NULL
    ` as any[];

    const statusCache = new Map<string, TokenStatus | null>();

    await Promise.all(
      distinctMintRows.map(async (row) => {
        const mint = row.token_contract as string | null;
        if (!mint || statusCache.has(mint)) return;
        try {
          const reg = await getStatusRow(mint);
          statusCache.set(mint, (reg?.status ?? null) as TokenStatus | null);
        } catch (e) {
          console.warn(
            '[stats] preload getStatusRow failed:',
            (e as any)?.message || e,
          );
          statusCache.set(mint, null);
        }
      })
    );

    let totalUsdEligible = 0;
    for (const row of contribRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      const isDead = await isDeadcoinForMegy(mint, usd, statusCache);
      if (!isDead) totalUsdEligible += usd;
    }

    const popularRows = await sql`
      SELECT token_symbol, token_contract, COUNT(*) AS cnt
      FROM contributions
      WHERE token_contract IS NOT NULL
      GROUP BY token_symbol, token_contract
    ` as any[];

    const deadcoinSet = new Set<string>();
    for (const row of distinctMintRows) {
      const mint = row.token_contract as string | null;
      if (!mint) continue;
      const status = statusCache.get(mint);
      if (status === 'deadcoin') deadcoinSet.add(mint);
    }

    const uniqueDeadcoins = deadcoinSet.size;

    let mostPopularDeadcoin = 'No deadcoin yet';
    if (deadcoinSet.size > 0) {
      let bestSymbol = 'No deadcoin yet';
      let bestCount = 0;

      for (const row of popularRows) {
        const mint = row.token_contract as string | null;
        if (!mint || !deadcoinSet.has(mint)) continue;

        const cnt = Number(row.cnt || 0);
        if (cnt > bestCount && row.token_symbol) {
          bestCount = cnt;
          bestSymbol = String(row.token_symbol);
        }
      }

      mostPopularDeadcoin = bestSymbol;
    }

    const totalParticipants = Number(participantResult[0]?.count ?? 0);
    const totalUsd = totalUsdEligible;

    const res = NextResponse.json({
      success: true,

      // canonical fields
      totalParticipants,
      totalUsd,
      uniqueDeadcoins,
      mostPopularDeadcoin,

      // backward-compatible aliases
      participantCount: totalParticipants,
      totalUsdValue: totalUsd,
    });

    res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res;
  } catch (error) {
    console.error('[STATS API ERROR]', error);

    const res = NextResponse.json(
      {
        success: true,
        degraded: true,

        totalParticipants: 0,
        totalUsd: 0,
        uniqueDeadcoins: 0,
        mostPopularDeadcoin: 'No deadcoin yet',

        participantCount: 0,
        totalUsdValue: 0,
      },
      { status: 200 }
    );

    res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res;
  }
}