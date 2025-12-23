// app/api/utils/getUsdValue.ts
// Fast & robust SPL pricing with SOL/WSOL normalization.
// Default source order (best for Solana): jupiter -> raydium -> coingecko -> cmc
// You can override via env: PRICE_SOURCE_ORDER="coingecko,raydium,jupiter,cmc"

export type PriceResult = {
  // ✅ KEEP LEGACY STATUS VALUES (backward compatible)
  status: 'found' | 'not_found' | 'error';

  // amount-adjusted
  usdValue: number;

  // ✅ new: per 1 token (useful for UI/debug)
  unitPriceUSD: number;

  // keep existing shape
  sources: Array<{ source: string; price: number }>;

  // optional
  error?: string;

  // ✅ optional helper flag (doesn't break anyone)
  ok?: boolean;
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
  const ttlMs = mint === NATIVE_MINT ? 60_000 : 120_000; // 60s / 120s
  cache.set(mint, { price, source, expires: Date.now() + ttlMs });
}

// ----------------------------- helpers ------------------------------
async function fetchJSON<T>(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {}
): Promise<T> {
  const res = await fetch(url, {
    signal: (AbortSignal as any).timeout(timeoutMs),
    headers: { accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// ----------------------------- sources ------------------------------
async function jupiterV3Price(mint: string, timeoutMs = 1200): Promise<number> {
  const url = `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const p = data?.[mint]?.usdPrice;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from jupiter');
  return p;
}

async function raydiumV3Price(mint: string, timeoutMs = 1600): Promise<number> {
  const url = `https://api-v3.raydium.io/mint/price?mints=${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const raw = data?.data?.[mint] ?? data?.[mint];
  const p = typeof raw === 'number' ? raw : Number(raw);
  if (!p || !isFinite(p)) throw new Error('No price from raydium');
  return p;
}

async function coingeckoPrice(mint: string, timeoutMs = 1800): Promise<number> {
  const url = `https://api.coingecko.com/api/v3/coins/solana/contract/${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url, timeoutMs);
  const p = data?.market_data?.current_price?.usd;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from coingecko');
  return p;
}

async function cmcPrice(mint: string, timeoutMs = 1800): Promise<number> {
  const key = process.env.CMC_API_KEY;
  if (!key) throw new Error('CMC_API_KEY missing');
  const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?address=${encodeURIComponent(
    mint
  )}&aux=platform`;
  const data: any = await fetchJSON<any>(url, timeoutMs, { 'X-CMC_PRO_API_KEY': key });
  const first = Object.values(data?.data || {}).find((x: any) => x?.quote?.USD?.price);
  const p = (first as any)?.quote?.USD?.price;
  if (typeof p !== 'number' || !isFinite(p)) throw new Error('No price from cmc');
  return p;
}

// ---------------------- dynamic source ordering ---------------------
type SourceName = 'jupiter' | 'raydium' | 'coingecko' | 'cmc';

function parseOrder(): SourceName[] {
  const env = (process.env.PRICE_SOURCE_ORDER || '').trim();
  if (!env) return ['jupiter', 'raydium', 'coingecko', 'cmc'];

  const out: SourceName[] = [];
  for (const raw of env.split(',')) {
    const s = raw.trim().toLowerCase();
    if (s === 'jupiter' || s === 'raydium' || s === 'coingecko' || s === 'cmc') out.push(s);
  }
  return out.length ? out : ['jupiter', 'raydium', 'coingecko', 'cmc'];
}

// For SOL/WSOL we always try Jupiter first (fast-path), regardless of env order.
function getOrderForMint(mint: string): SourceName[] {
  const base = parseOrder();
  if (mint === NATIVE_MINT) {
    const seen = new Set<string>();
    return (['jupiter', ...base] as SourceName[]).filter(s =>
      seen.has(s) ? false : (seen.add(s), true)
    );
  }
  return base;
}

async function runSource(name: SourceName, mint: string): Promise<{ name: SourceName; price: number }> {
  switch (name) {
    case 'jupiter':
      return { name, price: await jupiterV3Price(mint) };
    case 'raydium':
      return { name, price: await raydiumV3Price(mint) };
    case 'coingecko':
      return { name, price: await coingeckoPrice(mint) };
    case 'cmc':
      return { name, price: await cmcPrice(mint) };
  }
}

// ------------------------------ main --------------------------------
export default async function getUsdValue(
  args: { mint: string; amount?: number; symbol?: string } | string,
  maybeAmount?: number
): Promise<PriceResult> {
  let mint = typeof args === 'string' ? args : args.mint;
  const symbol = (typeof args === 'string' ? undefined : args.symbol) || undefined;
  const amount = typeof args === 'string' ? (maybeAmount ?? 1) : (args.amount ?? 1);

  // --- NORMALIZATION: treat SOL/WSOL/SystemProgram/empty as WSOL (NATIVE_MINT)
  const mintU = (mint || '').trim().toUpperCase();
  const symU = (symbol || '').trim().toUpperCase();
  if (
    !mint ||
    mint === SYSTEM_PROGRAM ||
    mintU === 'SOL' || mintU === 'WSOL' ||
    symU === 'SOL' || symU === 'WSOL'
  ) {
    mint = NATIVE_MINT;
  }

  const sources: Array<{ source: string; price: number }> = [];
  if (!mint) {
    return { status: 'error', usdValue: 0, unitPriceUSD: 0, sources, ok: false, error: 'mint is required' };
  }

  // cache
  const c = getFromCache(mint);
  if (c) {
    sources.push({ source: `${c.source}(cache)`, price: c.price });
    return {
      status: 'found',
      usdValue: c.price * amount,
      unitPriceUSD: c.price,
      sources,
      ok: true,
    };
  }

  // WSOL fast-path
  if (mint === NATIVE_MINT) {
    try {
      const p = await jupiterV3Price(mint, 1200);
      setCache(mint, p, 'jupiter');
      sources.push({ source: 'jupiter', price: p });
      return { status: 'found', usdValue: p * amount, unitPriceUSD: p, sources, ok: true };
    } catch {
      // fallthrough
    }
  }

  // Sequential short-circuit by order
  const order = getOrderForMint(mint);
  for (const src of order) {
    try {
      const { price, name } = await runSource(src, mint);
      setCache(mint, price, name);
      sources.push({ source: name, price });
      return { status: 'found', usdValue: price * amount, unitPriceUSD: price, sources, ok: true };
    } catch {
      // try next
    }
  }

  return { status: 'not_found', usdValue: 0, unitPriceUSD: 0, sources, ok: false, error: 'all sources failed' };
}
