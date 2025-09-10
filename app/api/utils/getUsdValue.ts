// app/api/utils/getUsdValue.ts
import { fetchPriceProxy } from './fetchPriceProxy';
import { fetchRaydiumPrice } from './fetchPriceFromRaydium';
import { fetchJupiterPrice } from './fetchPriceFromJupiter';
import { fetchCMCPrice } from './fetchPriceFromCMC';

interface TokenInfo {
  mint: string;
  symbol?: string;
}

interface PriceSource {
  price: number;
  source: string;
}

export interface PriceResult {
  usdValue: number;
  sources: PriceSource[];
  status: 'found' | 'not_found' | 'loading' | 'error';
}

/* -------------------- Normalize helpers (SOL→WSOL, alias→canonical) -------------------- */
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const isMintLike = (x: string) =>
  typeof x === 'string' &&
  x.length >= 32 &&
  x.length <= 64 &&
  /^[1-9A-HJ-NP-Za-km-z]+$/.test(x);

async function normalizeInput(mint: string, symbol?: string): Promise<string> {
  const raw = (mint || symbol || '').trim();
  if (!raw) return raw;

  // 1) SOL özel durumu → WSOL mint
  if (raw.toUpperCase() === 'SOL' || raw === WSOL_MINT) return WSOL_MINT;

  // 2) Base58 mint gibi görünüyorsa (SPL) → dokunma
  if (isMintLike(raw)) return raw;

  // 3) Alias/sembol ise kanonik mint'e çözmeyi dene (varsa)
  try {
    // Bu modül projende mevcutsa kanonik çözümler; yoksa try/catch yutar, sorun olmaz.
    const mod: any = await import('@/app/api/_lib/aliases');
    if (typeof mod?.getCanonicalMint === 'function') {
      const a = await mod.getCanonicalMint(raw);
      if (a) return a;
    }
  } catch {
    /* ignore */
  }

  return raw;
}

/* --------------------------------- Caching & timing ---------------------------------- */
const priceCache = new Map<string, { price: number; source: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 dakika
const TIMEOUT_MS = 2000; // Her kaynak için maksimum bekleme süresi (agresif ayarını koruduk)

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.warn('🕒 Request timed out after', ms, 'ms');
      reject(new Error('Timeout'));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timeout);
        console.log('✅ Price source responded');
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.warn('❌ Price fetch failed:', (err as any)?.message || String(err));
        reject(err);
      });
  });
}

/* ---------------------------- Jupiter SOL id fallback helper -------------------------- */
async function fetchJupiterSOLById(): Promise<number | null> {
  try {
    const u = new URL('https://price.jup.ag/v6/price');
    u.searchParams.set('ids', 'SOL');
    const r = await fetch(u, { method: 'GET', cache: 'no-store' });
    if (!r.ok) return null;
    const j: any = await r.json().catch(() => null);
    const p = j?.data?.SOL?.price;
    const n = typeof p === 'number' ? p : Number(p);
    return n && n > 0 && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/* ------------------------------------- Main ------------------------------------------- */
export default async function getUsdValue(
  token: TokenInfo,
  amount: number
): Promise<PriceResult> {
  console.log('⏳ Starting price fetch for', token.symbol || token.mint);

  // ✅ 1) Girdiyi normalize et (SOL→WSOL, alias→canonical)
  const canon = await normalizeInput(token.mint, token.symbol);
  const key = canon || (token.symbol || '').trim().toUpperCase();
  const now = Date.now();

  // ✅ 2) Cache (pozitif)
  const cached = priceCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log('⚡ Returning cached price for', token.symbol || canon);
    return {
      usdValue: cached.price * amount,
      sources: [{ price: cached.price, source: cached.source }],
      status: 'found',
    };
  }

  // ✅ 3) Kaynakları sırayla (mevcut mimariyi bozmadan) dene — ama normalize edilmiş mint ile
  const sources = [
    { fn: fetchPriceProxy, name: 'coingecko' },
    { fn: fetchRaydiumPrice, name: 'raydium' },
    { fn: fetchJupiterPrice, name: 'jupiter' },
    { fn: fetchCMCPrice, name: 'cmc' },
  ];

  for (const { fn, name } of sources) {
    try {
      console.log(`🌐 Trying ${name}...`);
      const price = await withTimeout(
        fn({ mint: canon, symbol: token.symbol }),
        TIMEOUT_MS
      );
      if (price && price > 0) {
        console.log(`✅ ${name} returned price: $${price}`);
        priceCache.set(key, { price, source: name, timestamp: now });
        return {
          usdValue: price * amount,
          sources: [{ price, source: name }],
          status: 'found',
        };
      } else {
        console.warn(`⚠️ ${name} returned zero or invalid price`);
      }
    } catch (err: any) {
      console.warn(`🚫 ${name} failed:`, err?.message || String(err));
    }
  }

  // ✅ 4) SOL için son çare: Jupiter ids=SOL fallback
  if (canon === WSOL_MINT || (token.symbol || '').toUpperCase() === 'SOL') {
    try {
      console.log('🛟 Fallback: jupiter ids=SOL');
      const solPx = await withTimeout(fetchJupiterSOLById(), TIMEOUT_MS);
      if (solPx && solPx > 0) {
        priceCache.set(key, { price: solPx, source: 'jupiter-sol', timestamp: now });
        return {
          usdValue: solPx * amount,
          sources: [{ price: solPx, source: 'jupiter-sol' }],
          status: 'found',
        };
      }
    } catch (e) {
      console.warn('🚫 jupiter-sol fallback failed');
    }
  }

  console.warn('❌ No price source returned a valid result');
  return {
    usdValue: 0,
    sources: [],
    status: 'not_found',
  };
}
