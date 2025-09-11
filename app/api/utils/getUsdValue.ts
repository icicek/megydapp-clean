// app/api/utils/getUsdValue.ts
// Fast & robust SPL pricing with SOL/WSOL normalization.
// Default source order (best for Solana): jupiter -> raydium -> coingecko -> cmc
// You can override via env: PRICE_SOURCE_ORDER="coingecko,raydium,jupiter,cmc"

export type PriceResult = {
  usdValue: number;
  sources: Array<{ source: string; price: number }>;
  status: 'found' | 'not_found' | 'error';
  error?: string;
};

const NATIVE_MINT = 'So11111111111111111111111111111111111111112'; // WSOL
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

// ---------- tiny in-memory TTL cache (per lambda instance) ----------
type CacheEntry = { price: number; source: string; expires: number };
const cache = new Map<string, CacheEntry>();

function getFromCache(mint: string): CacheEntry | null {
  const c = cache.get(mint);
  if (c && c.expires > Date.now()) return c;
  if (c) cache.delete(mint);
  return null;
}
function setCache(mint: string, price: number, source: string) {
  // Lower TTL for SOL/WSOL; moderate for others
  const ttlMs = mint === NATIVE_MINT ? 60_000 : 120_000; // 60s / 120s
  cache.set(mint, { price, source, expires: Date.now() + ttlMs });
}

// ----------------------------- helpers ------------------------------
async function fetchJSON<T>(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    signal: (AbortSignal as any).timeout(timeoutMs),
    headers: { accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// ----------------------------- sources ------------------------------
async function jupiterV3Price(mint: string, timeoutMs = 1200): Promise<number> {
  // https://lite-api.jup.ag/price/v3?ids=<mint>
  const url = `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const p = data?.[mint]?.usdPrice;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from jupiter');
  return p;
}

async function raydiumV3Price(mint: string, timeoutMs = 1600): Promise<number> {
  // https://api-v3.raydium.io/mint/price?mints=<mint>
  const url = `https://api-v3.raydium.io/mint/price?mints=${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const raw = data?.data?.[mint] ?? data?.[mint];
  const p = typeof raw === 'number' ? raw : Number(raw);
  if (!p || !isFinite(p)) throw new Error('No price from raydium');
  return p;
}

async function coingeckoPrice(mint: string, timeoutMs = 1800): Promise<number> {
  // public endpoint; keep tight timeout
  const url = `https://api.coingecko.com/api/v3/coins/solana/contract/${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const p = data?.market_data?.current_price?.usd;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from coingecko');
  return p;
}

async function cmcPrice(mint: string, timeoutMs = 1800): Promise<number> {
  const key = process.env.CMC_API_KEY;
  if (!key) throw new Error('CMC_API_KEY missing');
  // Address (platform) lookup for Solana
  const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?address=${encodeURIComponent(mint)}&aux=platform`;
  const data: any = await fetchJSON<any>(url, timeoutMs, { 'X-CMC_PRO_API_KEY': key });
  const first = Object.values(data?.data || {}).find((x: any) => x?.quote?.USD?.price);
  const p = (first as any)?.quote?.USD?.price;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from cmc');
  return p;
}

// ---------------------- dynamic source ordering ---------------------
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

// ------------------------------ main --------------------------------
export default async function getUsdValue(
  args: { mint: string; amount?: number; symbol?: string } | string,
  maybeAmount?: number
): Promise<PriceResult> {
  // Support both signatures: ({ mint, amount, symbol? }) OR (mint, amount)
  let mint = typeof args === 'string' ? args : args.mint;
  const symbol = (typeof args === 'string' ? undefined : (args as any).symbol) || undefined;
  const amount = typeof args === 'string' ? (maybeAmount ?? 1) : (args.amount ?? 1);

  // --- NORMALIZATION: treat SOL/WSOL/SystemProgram/empty as WSOL (NATIVE_MINT)
  const mintU = (mint || '').trim().toUpperCase();
  const symU  = (symbol || '').trim().toUpperCase();
  if (
    !mint ||
    mint === SYSTEM_PROGRAM ||
    mintU === 'SOL' || mintU === 'WSOL' ||
    symU  === 'SOL' || symU  === 'WSOL'
  ) {
    mint = NATIVE_MINT;
  }

  const sources: Array<{ source: string; price: number }> = [];
  if (!mint) return { usdValue: 0, sources, status: 'error', error: 'mint is required' };

  // cache
  const c = getFromCache(mint);
  if (c) {
    sources.push({ source: `${c.source}(cache)`, price: c.price });
    return { usdValue: c.price * amount, sources, status: 'found' };
  }

  // WSOL fast-path
  if (mint === NATIVE_MINT) {
    try {
      const p = await jupiterV3Price(mint, 1200);
      setCache(mint, p, 'jupiter');
      sources.push({ source: 'jupiter', price: p });
      return { usdValue: p * amount, sources, status: 'found' };
    } catch { /* fallthrough to general order */ }
  }

  // Sequential short-circuit by order
  const order = getOrderForMint(mint);
  for (const src of order) {
    try {
      const { price, name } = await runSource(src, mint);
      setCache(mint, price, name);
      sources.push({ source: name, price });
      return { usdValue: price * amount, sources, status: 'found' };
    } catch {
      // try next
    }
  }

  return { usdValue: 0, sources, status: 'not_found', error: 'all sources failed' };
}
