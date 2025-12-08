// app/api/coincarnation/stats/route.ts

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  getStatusRow,
  type TokenStatus,
} from '@/app/api/_lib/registry';

const sql = neon(process.env.DATABASE_URL!);
export const revalidate = 0;

// Ortak helper
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
    // Katılımcı sayısı: katkı yapan tüm cüzdanlar (deadcoin dahil)
    const participantResult = await sql`
      SELECT COUNT(DISTINCT wallet_address) AS count FROM contributions;
    `;

    // Global MEGY-eligible USD:
    const contribRows = await sql/* sql */`
      SELECT token_contract, usd_value
      FROM contributions;
    ` as any[];

    const statusCache = new Map<string, TokenStatus | null>();
    let totalUsdEligible = 0;
    for (const row of contribRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      const isDead = await isDeadcoinForMegy(mint, usd, statusCache);
      if (!isDead) totalUsdEligible += usd;
    }

    // Deadcoin sayısı: fiyat 0 veya statü deadcoin (display için)
    const deadcoinRows = await sql/* sql */`
      SELECT DISTINCT token_contract, usd_value
      FROM contributions
      WHERE token_contract IS NOT NULL;
    ` as any[];

    const deadcoinSet = new Set<string>();
    for (const row of deadcoinRows) {
      const usd = Number(row.usd_value ?? 0);
      const mint = row.token_contract as string | null;
      if (!mint) continue;

      const isDead = await isDeadcoinForMegy(mint, usd, statusCache);
      if (isDead) deadcoinSet.add(mint);
    }
    const uniqueDeadcoins = deadcoinSet.size;

    // En popüler deadcoin (sadece display; rough hesap)
    // Basitçe: deadcoinSet'teki mint'ler için contributions'ı sayalım
    let mostPopularDeadcoin = 'No deadcoin yet';
    if (deadcoinSet.size > 0) {
      const popularRows = await sql/* sql */`
        SELECT token_symbol, token_contract, COUNT(*) AS cnt
        FROM contributions
        WHERE token_contract IS NOT NULL
        GROUP BY token_symbol, token_contract
      ` as any[];

      let bestSymbol = 'No deadcoin yet';
      let bestCount = 0;
      for (const row of popularRows) {
        const mint = row.token_contract as string | null;
        if (!mint || !deadcoinSet.has(mint)) continue;

        const cnt = Number(row.cnt || 0);
        if (cnt > bestCount && row.token_symbol) {
          bestCount = cnt;
          bestSymbol = row.token_symbol as string;
        }
      }
      mostPopularDeadcoin = bestSymbol;
    }

    const res = NextResponse.json({
      success: true,
      totalParticipants: Number(participantResult[0]?.count ?? 0),
      totalUsd: totalUsdEligible,
      uniqueDeadcoins,
      mostPopularDeadcoin,
    });
    res.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res;
  } catch (error) {
    console.error('[STATS API ERROR]', error);
    const res = NextResponse.json(
      {
        success: true, // degrade: UI kırılmasın
        degraded: true,
        totalParticipants: 0,
        totalUsd: 0,
        uniqueDeadcoins: 0,
        mostPopularDeadcoin: 'No deadcoin yet',
      },
      { status: 200 },
    );
    res.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res;
  }
}
