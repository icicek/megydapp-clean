// app/api/utils/getUsdValue.ts
// Fast & robust SPL pricing with dynamic source order.
// Default order (best for Solana): jupiter,raydium,coingecko,cmc
// Override via env: PRICE_SOURCE_ORDER="coingecko,raydium,jupiter,cmc"

export type PriceResult = {
  usdValue: number;
  sources: Array<{ source: string; price: number }>;
  status: 'found' | 'not_found' | 'error';
  error?: string;
};

const NATIVE_MINT = 'So11111111111111111111111111111111111111112';

// --- tiny in-memory TTL cache (per lambda instance) ---
type CacheEntry = { price: number; source: string; expires: number };
const cache = new Map<string, CacheEntry>();
function getFromCache(mint: string): CacheEntry | null {
  const c = cache.get(mint);
  if (c && c.expires > Date.now()) return c;
  if (c) cache.delete(mint);
  return null;
}
function setCache(mint: string, price: number, source: string) {
  // lower TTL for SOL, moderate for others
  const ttl = mint === NATIVE_MINT ? 60_000 : 120_000; // 60s / 120s
  cache.set(mint, { price, source, expires: Date.now() + ttl });
}

// --- helpers ---
async function fetchJSON<T>(url: string, timeoutMs: number, headers: Record<string,string> = {}): Promise<T> {
  const res = await fetch(url, { signal: (AbortSignal as any).timeout(timeoutMs), headers: { accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// ---- Sources ----

// 1) Jupiter v3 (lite) — fastest/most reliable on Solana
async function jupiterV3Price(mint: string, timeoutMs = 1200): Promise<number> {
  const url = `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const p = data?.[mint]?.usdPrice;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from jupiter');
  return p;
}

// 2) Raydium v3
async function raydiumV3Price(mint: string, timeoutMs = 1600): Promise<number> {
  const url = `https://api-v3.raydium.io/mint/price?mints=${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const raw = data?.data?.[mint] ?? data?.[mint];
  const p = typeof raw === 'number' ? raw : Number(raw);
  if (!p || !isFinite(p)) throw new Error('No price from raydium');
  return p;
}

// 3) CoinGecko (contract on Solana)
// Note: public endpoint, keep tight timeout.
async function coingeckoPrice(mint: string, timeoutMs = 1800): Promise<number> {
  const url = `https://api.coingecko.com/api/v3/coins/solana/contract/${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const p = data?.market_data?.current_price?.usd;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from coingecko');
  return p;
}

// 4) CoinMarketCap (contract) — requires API key
async function cmcPrice(mint: string, timeoutMs = 1800): Promise<number> {
  const key = process.env.CMC_API_KEY;
  if (!key) throw new Error('CMC_API_KEY missing');
  // address lookup for Solana:
  const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?address=${encodeURIComponent(mint)}&aux=platform`;
  const data: any = await fetchJSON<any>(url, timeoutMs, { 'X-CMC_PRO_API_KEY': key });
  // response can be keyed by ID; find first item with a quote
  const first = Object.values(data?.data || {}).find((x: any) => x?.quote?.USD?.price);
  const p = (first as any)?.quote?.USD?.price;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from cmc');
  return p;
}

// dynamic source order
function parseOrder(): string[] {
  const env = (process.env.PRICE_SOURCE_ORDER || '').trim();
  if (!env) return ['jupiter', 'raydium', 'coingecko', 'cmc'];
  return env.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// For SOL/WSOL we always try Jupiter first (fast-path), regardless of env order.
function getOrderForMint(mint: string): string[] {
  const base = parseOrder();
  if (mint === NATIVE_MINT) {
    const seen = new Set<string>();
    // ensure jupiter at front
    return ['jupiter', ...base].filter(s => (seen.has(s) ? false : (seen.add(s), true)));
  }
  return base;
}

async function runSource(name: string, mint: string): Promise<{ name: string; price: number }> {
  switch (name) {
    case 'jupiter':   return { name, price: await jupiterV3Price(mint) };
    case 'raydium':   return { name, price: await raydiumV3Price(mint) };
    case 'coingecko': return { name, price: await coingeckoPrice(mint) };
    case 'cmc':       return { name, price: await cmcPrice(mint) };
    default: throw new Error(`unknown source: ${name}`);
  }
}

export default async function getUsdValue(
  args: { mint: string; amount?: number } | string,
  maybeAmount?: number
): Promise<PriceResult> {
  const mint = typeof args === 'string' ? args : args.mint;
  const amount = typeof args === 'string' ? (maybeAmount ?? 1) : (args.amount ?? 1);

  const sources: Array<{ source: string; price: number }> = [];
  if (!mint) return { usdValue: 0, sources, status: 'error', error: 'mint is required' };

  // cache hit?
  const c = getFromCache(mint);
  if (c) {
    sources.push({ source: `${c.source}(cache)`, price: c.price });
    return { usdValue: c.price * amount, sources, status: 'found' };
  }

  // fast-path for WSOL
  if (mint === NATIVE_MINT) {
    try {
      const p = await jupiterV3Price(mint, 1200);
      setCache(mint, p, 'jupiter');
      sources.push({ source: 'jupiter', price: p });
      return { usdValue: p * amount, sources, status: 'found' };
    } catch { /* fallthrough */ }
  }

  // sequential short-circuit
  const order = getOrderForMint(mint);
  for (const src of order) {
    try {
      const { price, name } = await runSource(src, mint);
      setCache(mint, price, name);
      sources.push({ source: name, price });
      return { usdValue: price * amount, sources, status: 'found' };
    } catch { /* try next */ }
  }

  return { usdValue: 0, sources, status: 'not_found', error: 'all sources failed' };
}
