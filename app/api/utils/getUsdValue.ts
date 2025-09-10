// app/api/utils/getUsdValue.ts
import { fetchPriceProxy } from './fetchPriceProxy';
import { fetchRaydiumPrice } from './fetchPriceFromRaydium';
import { fetchJupiterPrice } from './fetchPriceFromJupiter';
import { fetchCMCPrice } from './fetchPriceFromCMC';

/** --- Yeni yardımcılar --- */
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// (İstersen buraya USDC/USDT gibi stables mintlerini ekleyebilirsin)
const STABLES: Record<string, number> = {
  // 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1, // USDC (Solana)
  // 'Es9vMFrzaCERZ8ZrxhniTA6Vh6CkBx7x1iYyR6N3ZZBu': 1, // USDT (Solana)
};

function isMintLike(x: string) {
  return typeof x === 'string' && x.length >= 32 && x.length <= 64 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(x);
}

// Eğer projede alias/canonical fonksiyonun varsa burada kullan.
async function resolveCanonicalMint(inputMint: string, symbol?: string): Promise<string> {
  const raw = (inputMint || symbol || '').trim();

  if (!raw) return raw;

  // 1) SOL özel durumu → WSOL mint
  if (raw.toUpperCase() === 'SOL' || raw === WSOL_MINT) {
    return WSOL_MINT;
  }

  // 2) Mint değilse (sembol/alias gelebilir) — hook: getCanonicalMint kullan
  if (!isMintLike(raw)) {
    // try {
    //   const { getCanonicalMint } = await import('@/app/api/_lib/aliases');
    //   const a = await getCanonicalMint(raw);
    //   if (a) return a;
    // } catch {}
    return raw; // alias çözemiyorsak geleni aynen deneyeceğiz
  }

  // 3) Zaten mint — varsa kanoniğe çek (hook)
  // try {
  //   const { getCanonicalMint } = await import('@/app/api/_lib/aliases');
  //   const a = await getCanonicalMint(raw);
  //   if (a) return a;
  // } catch {}

  return raw;
}

/** --- Mevcut tipler --- */
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

/** --- Cache’ler --- */
const priceCache = new Map<string, { price: number; source: string; timestamp: number }>();
const negativeCache = new Map<string, number>(); // key -> timestamp (no price)

/** --- Ayarlar --- */
const CACHE_TTL = 1000 * 60 * 5; // 5 dk
const NEG_TTL   = 1000 * 60 * 1; // 1 dk (bulunamadı negatif cache)
const TIMEOUT_MS = 4000;         // her kaynak için 4 sn → cold start’larda daha güvenli

/** AbortController tabanlı timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  // @ts-ignore fetch adapter’larında signal yoksa yok sayılır
  return promise.finally(() => clearTimeout(id));
}

/** Jupiter id=SOL fallback (SOL özel) */
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
  } catch { return null; }
}

/** Kaynağı saran, tek bir mint/symbol ile çağıran yardımcı */
function adapt(fn: (arg: { mint: string; symbol?: string }) => Promise<number>, name: string, mint: string, symbol?: string) {
  return async (): Promise<PriceSource> => {
    const price = await withTimeout(fn({ mint, symbol }), TIMEOUT_MS);
    const n = Number(price);
    if (!n || !Number.isFinite(n) || n <= 0) throw new Error(`${name}: invalid price`);
    return { price: n, source: name };
  };
}

/** --------- Ana fonksiyon (drop-in) --------- */
export default async function getUsdValue(token: TokenInfo, amount: number): Promise<PriceResult> {
  const canonical = await resolveCanonicalMint(token.mint, token.symbol);
  const key = canonical || (token.symbol || '').trim().toUpperCase();
  const now = Date.now();

  // 0) Stables kısa yol
  if (STABLES[canonical]) {
    const p = STABLES[canonical];
    return { usdValue: p * amount, sources: [{ price: p, source: 'stable' }], status: 'found' };
  }

  // 1) Negatif cache (aynı soruyu spamlamayalım)
  const negAt = negativeCache.get(key);
  if (negAt && now - negAt < NEG_TTL) {
    return { usdValue: 0, sources: [], status: 'not_found' };
  }

  // 2) Pozitif cache
  const cached = priceCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return {
      usdValue: cached.price * amount,
      sources: [{ price: cached.price, source: cached.source }],
      status: 'found',
    };
  }

  // 3) Kaynakları paralel dene (hedged)
  // Not: İlk dönebilen kazanır (Promise.any). Hepsi fail ederse seri fallback’a geçeriz.
  const tasks: Array<() => Promise<PriceSource>> = [
    adapt(fetchPriceProxy,   'coingecko', canonical, token.symbol),  // id veya proxy mint desteği varsa
    adapt(fetchRaydiumPrice, 'raydium',   canonical, token.symbol),
    adapt(fetchJupiterPrice, 'jupiter',   canonical, token.symbol),
    adapt(fetchCMCPrice,     'cmc',       canonical, token.symbol),
  ];

  // Eğer SOL ise özel Jupiter id fallback’i de (paralelde) ekle
  if (canonical === WSOL_MINT || (token.symbol || '').toUpperCase() === 'SOL') {
    tasks.push(async () => {
      const price = await withTimeout(fetchJupiterSOLById(), TIMEOUT_MS);
      if (!price) throw new Error('jupiter-sol: invalid price');
      return { price, source: 'jupiter-sol' };
    });
  }

  let winner: PriceSource | null = null;
  const errors: string[] = [];

  // Promise.any polyfill: tek tek başlatıp ilk başarılıyı al
  await Promise.allSettled(tasks.map(t => t().then(p => { if (!winner) winner = p; } ).catch(e => errors.push(String(e?.message || e)))));
  if (!winner) {
    // Seri fallback (ağ koşulları kötü ise)
    for (const t of tasks) {
      try {
        winner = await t();
        break;
      } catch (e: any) {
        errors.push(String(e?.message || e));
      }
    }
  }

  if (winner) {
    priceCache.set(key, { price: winner.price, source: winner.source, timestamp: now });
    return { usdValue: winner.price * amount, sources: [winner], status: 'found' };
  }

  // Negatif cache’le ve not_found dön
  negativeCache.set(key, now);
  // İstersen debug için errors dizisini bir yere loglayabilirsin
  return { usdValue: 0, sources: [], status: 'not_found' };
}
