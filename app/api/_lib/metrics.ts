// app/api/_lib/metrics.ts
import { sql } from '@/app/api/_lib/db';
import { cache } from '@/app/api/_lib/cache';

export type LatestMetrics = {
  usdValue: number;
  volumeUSD?: number | null;
  liquidityUSD?: number | null;
};

// ---- helpers ----
function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const METRICS_TTL_SEC = parseInt(process.env.METRICS_TTL_SEC || '60', 10);

// Küçük cache key
function k(mint: string) { return `metrics:${mint}`; }

// 0) (Opsiyonel) DB’den oku — eğer böyle bir tablo varsa (ör. token_metrics)
async function fetchFromDB(mint: string): Promise<LatestMetrics | null> {
  try {
    const rows = (await sql`
      SELECT usd_value, volume_usd_24h, liquidity_usd
      FROM token_metrics
      WHERE mint = ${mint}
      ORDER BY observed_at DESC
      LIMIT 1
    `) as unknown as Array<{ usd_value: any; volume_usd_24h: any; liquidity_usd: any }>;
    if (!rows?.length) return null;
    const r = rows[0];
    const usdValue = num(r.usd_value);
    if (usdValue == null) return null;
    return {
      usdValue,
      volumeUSD: num(r.volume_usd_24h),
      liquidityUSD: num(r.liquidity_usd),
    };
  } catch (e: any) {
    // relation yoksa (42P01) yut
    if (e?.code === '42P01') return null;
    return null;
  }
}

// 1) Jupiter — sadece fiyat
async function fetchFromJupiter(mint: string): Promise<LatestMetrics | null> {
  try {
    const r = await fetch(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(mint)}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j: any = await r.json();
    const px = num(j?.data?.[mint]?.price);
    if (px == null) return null;
    return { usdValue: px };
  } catch { return null; }
}

// 2) DexScreener — pair bazlı; fiyat + (genelde) likidite ve 24h hacim
async function fetchFromDexScreener(mint: string): Promise<LatestMetrics | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j: any = await r.json();
    const pairs: any[] = Array.isArray(j?.pairs) ? j.pairs : [];
    if (!pairs.length) return null;

    // en yüksek likiditeli çifti seç
    pairs.sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
    const p = pairs[0];

    const px = num(p?.priceUsd);
    if (px == null) return null;

    return {
      usdValue: px,
      volumeUSD: num(p?.volume?.h24),
      liquidityUSD: num(p?.liquidity?.usd),
    };
  } catch { return null; }
}

// 3) Birdeye — fiyat (API key gerekli)
async function fetchFromBirdeye(mint: string): Promise<LatestMetrics | null> {
  try {
    const key = process.env.BIRDEYE_API_KEY || '';
    if (!key) return null;
    const r = await fetch(
      `https://public-api.birdeye.so/defi/price?address=${encodeURIComponent(mint)}&chain=solana`,
      { headers: { 'X-API-KEY': key }, cache: 'no-store' }
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const px = num(j?.data?.value);
    if (px == null) return null;
    return { usdValue: px };
  } catch { return null; }
}

// 4) CoinGecko — contract→price (Solana)
async function fetchFromCoinGecko(mint: string): Promise<LatestMetrics | null> {
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${encodeURIComponent(mint)}&vs_currencies=usd`,
      { cache: 'no-store' }
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const px = num(j?.[mint?.toLowerCase?.() || mint]?.usd);
    if (px == null) return null;
    return { usdValue: px };
  } catch { return null; }
}

/**
 * Fallback sırası:
 *  - ENV METRICS_FALLBACKS="db,jup,dexscreener,birdeye,coingecko"
 *  - Belirtilmezse varsayılan sıra kullanılır (aşağıdaki defaultOrder)
 *  - Sonuç cache’lenir (METRICS_TTL_SEC)
 */
export async function getLatestMetrics(mint: string): Promise<LatestMetrics | null> {
  const ck = k(mint);
  const cached = cache.get<LatestMetrics>(ck);
  if (cached) return cached;

  const order = (process.env.METRICS_FALLBACKS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const defaultOrder = ['db', 'jup', 'dexscreener', 'birdeye', 'coingecko'];
  const providers = (order.length ? order : defaultOrder);

  for (const p of providers) {
    let res: LatestMetrics | null = null;
    /* eslint-disable no-await-in-loop */
    if (p === 'db') res = await fetchFromDB(mint);
    else if (p === 'jup') res = await fetchFromJupiter(mint);
    else if (p === 'dexscreener') res = await fetchFromDexScreener(mint);
    else if (p === 'birdeye') res = await fetchFromBirdeye(mint);
    else if (p === 'coingecko') res = await fetchFromCoinGecko(mint);
    /* eslint-enable no-await-in-loop */

    if (res && typeof res.usdValue === 'number' && Number.isFinite(res.usdValue)) {
      cache.set(ck, res, METRICS_TTL_SEC);
      return res;
    }
  }
  return null;
}
