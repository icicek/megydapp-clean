// app/api/utils/getVolumeAndLiquidity.ts
// Multi-source (DexScreener → GeckoTerminal → Raydium) volume & liquidity resolver
// - Kısa timeout (fail fast), sıralı deneme, ilk başarılı sonucu döndür
// - Hafif in-memory TTL cache
// - ENV ile kaynak sırası ve timeout ayarı
//
// Kullanım: const { volume, liquidity, source } = await getVolumeAndLiquidity({ mint, symbol });

type TokenInfo = { mint: string; symbol?: string };

type VL = { volume: number | null; liquidity: number | null; source: string };

const DEFAULT_ORDER = ['dexscreener', 'geckoterminal', 'raydium'] as const;
type SourceName = (typeof DEFAULT_ORDER)[number];

// --- ENV ayarları ---
function parseOrder(): SourceName[] {
  const raw = (process.env.VL_SOURCE_ORDER || '').trim();
  if (!raw) return [...DEFAULT_ORDER];
  const m = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as SourceName[];
  const seen = new Set<string>();
  return (m.length ? m : [...DEFAULT_ORDER]).filter((x) =>
    seen.has(x) ? false : (seen.add(x), true)
  );
}

const TIMEOUT_MS = Number(process.env.VL_TIMEOUT_MS ?? 1800); // her istek için timeout
const CACHE_TTL_MS = Number(process.env.VL_CACHE_TTL_MS ?? 60_000); // 60s

// --- Tiny TTL cache ---
type CacheEntry = { vol: number | null; liq: number | null; src: string; exp: number };
const cache = new Map<string, CacheEntry>();
function cacheKey(mint: string) {
  return `vl:${mint}`;
}
function getFromCache(mint: string): CacheEntry | null {
  const c = cache.get(cacheKey(mint));
  if (!c) return null;
  if (c.exp > Date.now()) return c;
  cache.delete(cacheKey(mint));
  return null;
}
function setCache(mint: string, vol: number | null, liq: number | null, src: string) {
  cache.set(cacheKey(mint), { vol, liq, src, exp: Date.now() + CACHE_TTL_MS });
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

// Kaynak 1: DexScreener
// API: https://api.dexscreener.com/latest/dex/tokens/{address}
// Çok sayıda pair dönebilir; en yüksek likiditeli olanı seçiyoruz.
async function fromDexScreener(mint: string): Promise<VL> {
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

  // En yüksek likiditeyi seç
  let bestLiq = -1;
  let best: { liq: number | null; vol: number | null } | null = null;
  for (const p of pairs) {
    const liq = typeof p?.liquidity?.usd === 'number' ? p.liquidity!.usd! : null;
    const vol =
      typeof p?.volume?.h24 === 'number'
        ? p.volume!.h24!
        : typeof p?.volume?.h6 === 'number'
        ? p.volume!.h6! * 4
        : typeof p?.volume?.h1 === 'number'
        ? p.volume!.h1! * 24
        : null;

    const liqNum = liq ?? 0;
    if (liqNum > bestLiq) {
      bestLiq = liqNum;
      best = { liq, vol };
    }
  }

  if (!best) throw new Error('dexscreener:no_best');
  return { volume: best.vol ?? null, liquidity: best.liq ?? null, source: 'dexscreener' };
}

// Kaynak 2: GeckoTerminal
// API (token): https://api.geckoterminal.com/api/v2/networks/solana/tokens/{address}
// Rate-limit daha sıkı olabilir; kısa timeout + graceful fallback.
// Not: Sadece Solana ağı için kullanıyoruz; multi-chain ileride genişletilebilir.
async function fromGeckoTerminal(mint: string): Promise<VL> {
  type GTTokenResp = {
    data?: any;
    included?: Array<any>;
    // Bazı network'lerde token → top pools üzerinden info gelir
  };

  const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${encodeURIComponent(mint)}?include=top_pools`;
  const data = await fetchJSON<GTTokenResp>(url);

  const pools = Array.isArray(data?.included) ? data!.included! : [];
  // included içinden "pools" tipine bakıp (varsa) en yüksek likiditeli olanı seçelim
  type PoolAttr = { reserve_in_usd?: number; volume_usd_24h?: number };
  let bestLiq = -1;
  let best: { liq: number | null; vol: number | null } | null = null;

  for (const inc of pools) {
    // attributes yapısı farklılaşabiliyor, esnek oku
    const attr = (inc?.attributes || {}) as PoolAttr;
    const liq = typeof attr.reserve_in_usd === 'number' ? attr.reserve_in_usd : null;
    const vol = typeof attr.volume_usd_24h === 'number' ? attr.volume_usd_24h : null;
    const liqNum = liq ?? 0;
    if (liqNum > bestLiq) {
      bestLiq = liqNum;
      best = { liq, vol };
    }
  }

  if (!best) throw new Error('geckoterminal:no_pools');
  return { volume: best.vol ?? null, liquidity: best.liq ?? null, source: 'geckoterminal' };
}

// Kaynak 3: Raydium
// V3 endpoint örnekleri: https://api-v3.raydium.io/
// Doğrudan token → pool araması yoksa global pool listeleri büyük olabilir.
// Burada hafif bir “mint fiyat/likidite” kestirimi için price endpoint’den bir yaklaşım deneriz.
// Not: Raydium API'leri sık değişebiliyor; bu yüzden bu adımı en sona koyuyoruz.
async function fromRaydium(mint: string): Promise<VL> {
  // Basit bir fallback yaklaşımı: mint price endpoint yoksa veya pool listesi ağırsa null döner.
  // (İleride spesifik pool index’ine bağlı, ağır olmayan bir sorgu eklenebilir.)
  // Şimdilik conservative fallback:
  const url = `https://api-v3.raydium.io/mint/price?mints=${encodeURIComponent(mint)}`;
  const data: any = await fetchJSON<any>(url);
  const raw = data?.data?.[mint] ?? data?.[mint];
  const price = typeof raw === 'number' ? raw : Number(raw);
  if (!price || !isFinite(price)) throw new Error('raydium:no_price');

  // Fiyat var ama hacim/likidite verisi yok → bilinmiyor; null/ null.
  // (checkTokenLiquidityAndVolume ENV eşiklerine takılırsa walking_dead/deadcoin kararı verilebilir.)
  return { volume: null, liquidity: null, source: 'raydium' };
}

// Dispatcher
async function runSource(name: SourceName, mint: string): Promise<VL> {
  switch (name) {
    case 'dexscreener':
      return fromDexScreener(mint);
    case 'geckoterminal':
      return fromGeckoTerminal(mint);
    case 'raydium':
      return fromRaydium(mint);
    default:
      throw new Error(`unknown source: ${name}`);
  }
}

// Public API
export default async function getVolumeAndLiquidity(token: TokenInfo): Promise<VL> {
  const mint = (token?.mint || '').trim();
  if (!mint) return { volume: null, liquidity: null, source: 'invalid' };

  // Cache
  const c = getFromCache(mint);
  if (c) return { volume: c.vol, liquidity: c.liq, source: `${c.src}(cache)` };

  const order = parseOrder();
  let lastErr: unknown = null;

  for (const src of order) {
    try {
      const r = await runSource(src, mint);
      // Normalize: negatif/NaN → null
      const vol = typeof r.volume === 'number' && isFinite(r.volume) && r.volume >= 0 ? r.volume : null;
      const liq = typeof r.liquidity === 'number' && isFinite(r.liquidity) && r.liquidity >= 0 ? r.liquidity : null;
      setCache(mint, vol, liq, r.source);
      return { volume: vol, liquidity: liq, source: r.source };
    } catch (e) {
      lastErr = e;
      // devam et → sıradaki kaynağı dene
    }
  }

  // Hepsi patladı → null/null
  // (Sınıflandırma mantığı "bilinmiyor" yerine ENV eşiklerine göre walking_dead/deadcoin’e düşürür.)
  return { volume: null, liquidity: null, source: 'none' };
}
