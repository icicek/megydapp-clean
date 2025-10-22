// lib/solana/tokenMeta.ts
// Tek görev: bir mint için güvenilir şekilde {symbol, name, logoURI, verified} döndürmek.
// Kaynak sırası:
// 1) Bizim proxy: /api/tokenlist  (Jupiter listesi, cache'li)
// 2) On-chain fallback: /api/tokenmeta (Metaplex/Umi okuması)
// 3) Özel WSOL map’i
// 4) Fallback: null sembol (UI mint kısaltmasını gösterir)

export type TokenMeta = {
  symbol: string | null;
  name: string | null;
  logoURI?: string | null;
  verified?: boolean;
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Çok basit bir in-memory memo (client process içinde)
const MEMO = new Map<string, TokenMeta>();

async function fetchTokenMap(): Promise<Record<string, { symbol: string; name: string; logoURI?: string; verified?: boolean; decimals?: number | null }> | null> {
  try {
    const r = await fetch('/api/tokenlist', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchOnchainMeta(mint: string, cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'): Promise<TokenMeta | null> {
  try {
    const r = await fetch(`/api/tokenmeta?mint=${mint}&cluster=${cluster}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok) return null;
    const symbol = (j.symbol as string | undefined) || null;
    const name = (j.name as string | undefined) || null;
    return { symbol, name, logoURI: null, verified: false };
  } catch {
    return null;
  }
}

/**
 * getTokenMeta(mint, hintSymbol?)
 * - hintSymbol: UI’dan gelen tahmini sembol (varsa) — sadece boşlukları düzeltmek için kullanılıyor.
 */
export async function getTokenMeta(
  mint: string,
  hintSymbol?: string | null,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<TokenMeta> {
  const key = `${cluster}:${mint}`;
  const memoHit = MEMO.get(key);
  if (memoHit) return memoHit;

  // 0) WSOL özel durumu (native SOL için mint)
  if (mint === WSOL_MINT) {
    const solMeta: TokenMeta = { symbol: 'SOL', name: 'Solana', logoURI: null, verified: true };
    MEMO.set(key, solMeta);
    return solMeta;
  }

  // 1) Token list proxy (en güvenilir ve hızlı yol)
  const map = await fetchTokenMap();
  const t = map?.[mint];

  if (t?.symbol || t?.name) {
    const meta: TokenMeta = {
      symbol: tidySymbol(t.symbol),
      name: tidyName(t.name),
      logoURI: t.logoURI ?? null,
      verified: Boolean(t.verified),
    };
    MEMO.set(key, meta);
    return meta;
  }

  // 2) On-chain fallback (Metaplex metadata)
  const oc = await fetchOnchainMeta(mint, cluster);
  if (oc && (oc.symbol || oc.name)) {
    const meta: TokenMeta = {
      symbol: tidySymbol(oc.symbol ?? null) ?? tidySymbol(hintSymbol ?? null),
      name: tidyName(oc.name ?? null),
      logoURI: null,
      verified: false,
    };
    MEMO.set(key, meta);
    return meta;
  }

  // 3) Son çare: hintSymbol varsa onu kullan; yoksa null bırak
  const meta: TokenMeta = {
    symbol: tidySymbol(hintSymbol ?? null),
    name: null,
    logoURI: null,
    verified: false,
  };
  MEMO.set(key, meta);
  return meta;
}

// Küçük temizlikler: boşluk, illegal char vs.
function tidySymbol(sym: string | null): string | null {
  if (!sym) return null;
  const s = String(sym).trim();
  if (!s) return null;
  // Çok nadiren gelen \u0000 vb. karakterler:
  return s.replace(/\s+/g, '').slice(0, 16); // sembolleri 16 char ile sınırla
}
function tidyName(nm: string | null): string | null {
  if (!nm) return null;
  const s = String(nm).trim();
  return s || null;
}
