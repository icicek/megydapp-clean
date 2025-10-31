// app/api/utils/getVolumeAndLiquidity.ts
// ... (dosyanın üst açıklaması aynı kalsın)

import { getIncludeCex } from '@/app/api/_lib/settings';

type TokenInfo = { mint: string; symbol?: string };

export type VolumeLiquidity = {
  dexVolumeUSD: number | null;
  dexLiquidityUSD: number | null;
  cexVolumeUSD: number | null;
  totalVolumeUSD: number | null;
  dexSource: 'dexscreener' | 'geckoterminal' | 'none';
  cexSource: 'coingecko' | 'none';
};

const DEFAULT_DEX_ORDER = ['dexscreener', 'geckoterminal'] as const;
type DexSourceName = (typeof DEFAULT_DEX_ORDER)[number];

// --- ENV ayarları ---
function parseDexOrder(): DexSourceName[] {
  const raw = (process.env.VL_SOURCE_ORDER || '').trim();
  if (!raw) return [...DEFAULT_DEX_ORDER];
  const m = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as DexSourceName[];
  const seen = new Set<string>();
  return (m.length ? m : [...DEFAULT_DEX_ORDER]).filter((x) =>
    seen.has(x) ? false : (seen.add(x), true)
  );
}

const TIMEOUT_MS = Number(process.env.VL_TIMEOUT_MS ?? 1800);
const CACHE_TTL_MS = Number(process.env.VL_CACHE_TTL_MS ?? 60_000);

// Varsayılan CEX allowlist
const DEFAULT_CEX_LIST = [
  'binance','okx','kraken','coinbase-exchange','bybit','kucoin','bitget','mexc','gate',
] as const;
function parseCexAllowlist(): string[] {
  const raw = (process.env.CEX_EXCHANGES || '').trim();
  if (!raw) return [...DEFAULT_CEX_LIST];
  const arr = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const set = new Set<string>();
  [...arr].forEach(x => { if (!set.has(x)) set.add(x); });
  return Array.from(set);
}

// --- Tiny TTL cache ---
type CacheEntry = { val: VolumeLiquidity; exp: number };
const cache = new Map<string, CacheEntry>();
function cacheKey(mint: string) { return `vl2:${mint}`; }
function getFromCache(mint: string): VolumeLiquidity | null {
  const c = cache.get(cacheKey(mint));
  if (!c) return null;
  if (c.exp > Date.now()) return c.val;
  cache.delete(cacheKey(mint));
  return null;
}
function setCache(mint: string, val: VolumeLiquidity) {
  cache.set(cacheKey(mint), { val, exp: Date.now() + CACHE_TTL_MS });
}

// --- Helpers ---
async function fetchJSON<T>(url: string, timeoutMs = TIMEOUT_MS, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', ...headers },
    signal: (AbortSignal as any).timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}
function toNum(n: unknown): number | null {
  const x = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(x) ? x : null;
}

/* -------------------- DEX: DexScreener -------------------- */
async function dexFromDexScreener(mint: string): Promise<{ volume: number | null; maxLiq: number | null }> {
  type DS = {
    pairs?: Array<{
      liquidity?: { usd?: number };
      volume?: { h24?: number; h6?: number; h1?: number };
    }>;
  };
  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`;
  const data = await fetchJSON<DS>(url);

  const pairs = Array.isArray(data?.pairs) ? data!.pairs! : [];
  if (!pairs.length) throw new Error('dexscreener:no_pairs');

  let sumVol = 0;
  let maxLiq = 0;

  for (const p of pairs) {
    const v =
      toNum(p?.volume?.h24) ??
      (toNum(p?.volume?.h6) ? (p!.volume!.h6 as number) * 4 : null) ??
      (toNum(p?.volume?.h1) ? (p!.volume!.h1 as number) * 24 : null);
    if (v) sumVol += v;

    const liq = toNum(p?.liquidity?.usd) ?? 0;
    if (liq > maxLiq) maxLiq = liq;
  }

  return { volume: sumVol || 0, maxLiq: maxLiq || 0 };
}

/* -------------------- DEX: GeckoTerminal -------------------- */
async function dexFromGeckoTerminal(mint: string): Promise<{ volume: number | null; maxLiq: number | null }> {
  type GT = { included?: Array<{ attributes?: { reserve_in_usd?: number; volume_usd_24h?: number } }>; };
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${encodeURIComponent(mint)}?include=top_pools`;
  const data = await fetchJSON<GT>(url);

  const pools = Array.isArray(data?.included) ? data!.included! : [];
  if (!pools.length) throw new Error('geckoterminal:no_pools');

  let sumVol = 0;
  let maxLiq = 0;

  for (const inc of pools) {
    const attr = inc?.attributes || {};
    const v = toNum((attr as any).volume_usd_24h) ?? 0;
    const liq = toNum((attr as any).reserve_in_usd) ?? 0;
    if (v) sumVol += v;
    if (liq > maxLiq) maxLiq = liq;
  }

  return { volume: sumVol || 0, maxLiq: maxLiq || 0 };
}

/* -------------------- CEX: CoinGecko tickers -------------------- */
async function getCoingeckoIdForMint(mint: string): Promise<string | null> {
  const url = `https://api.coingecko.com/api/v3/coins/solana/contract/${encodeURIComponent(mint)}`;
  try {
    const data: any = await fetchJSON<any>(url, TIMEOUT_MS);
    const id = data?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}
async function cexFromCoingecko(coinId: string, allowlist: string[]): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/tickers?include_exchange_logo=false`;
  const data: any = await fetchJSON<any>(url, TIMEOUT_MS);
  const tickers: any[] = Array.isArray(data?.tickers) ? data.tickers : [];
  if (!tickers.length) return 0;

  let sum = 0;
  for (const t of tickers) {
    const id: string = String(t?.market?.identifier || '').toLowerCase();
    if (!id || !allowlist.includes(id)) continue;

    const stale = !!t?.is_stale;
    const anomaly = !!t?.is_anomaly;
    if (stale || anomaly) continue;

    const v = toNum(t?.converted_volume?.usd) ?? toNum(t?.volume);
    if (v) sum += v;
  }
  return sum || 0;
}

/* -------------------- Public API -------------------- */
export default async function getVolumeAndLiquidity(token: TokenInfo): Promise<VolumeLiquidity> {
  const mint = (token?.mint || '').trim();
  if (!mint) {
    return {
      dexVolumeUSD: null,
      dexLiquidityUSD: null,
      cexVolumeUSD: null,
      totalVolumeUSD: null,
      dexSource: 'none',
      cexSource: 'none',
    };
  }

  // Cache
  const c = getFromCache(mint);
  if (c) return c;

  // DEX: tek kaynak seç (öncelik sırası)
  const order = parseDexOrder();
  let dexVolume: number | null = null;
  let dexLiq: number | null = null;
  let dexSource: VolumeLiquidity['dexSource'] = 'none';

  for (const src of order) {
    try {
      if (src === 'dexscreener') {
        const { volume, maxLiq } = await dexFromDexScreener(mint);
        dexVolume = volume ?? 0;
        dexLiq = maxLiq ?? 0;
        dexSource = 'dexscreener';
        break;
      }
      if (src === 'geckoterminal') {
        const { volume, maxLiq } = await dexFromGeckoTerminal(mint);
        dexVolume = volume ?? 0;
        dexLiq = maxLiq ?? 0;
        dexSource = 'geckoterminal';
        break;
      }
    } catch {
      // sonraki kaynağı dene
    }
  }

  // CEX (admin ayarına bağlı)
  const includeCex = await getIncludeCex();
  let cexVolume: number | null = null;
  let cexSource: VolumeLiquidity['cexSource'] = 'none';

  if (includeCex) {
    try {
      const id = await getCoingeckoIdForMint(mint);
      if (id) {
        const allow = parseCexAllowlist();
        const v = await cexFromCoingecko(id, allow);
        cexVolume = v ?? 0;
        cexSource = 'coingecko';
      }
    } catch {
      // yut
    }
  }

  const out: VolumeLiquidity = {
    dexVolumeUSD: dexVolume ?? 0,
    dexLiquidityUSD: dexLiq ?? 0,
    cexVolumeUSD: includeCex ? (cexVolume ?? 0) : 0,
    totalVolumeUSD: (dexVolume ?? 0) + (includeCex ? (cexVolume ?? 0) : 0),
    dexSource,
    cexSource: includeCex ? cexSource : 'none',
  };

  setCache(mint, out);
  return out;
}
