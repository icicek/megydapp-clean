// lib/solana/tokenMeta.ts
// Amaç: Mint için güvenilir {symbol, name, logoURI, verified} döndürmek.
// Çatışma çözümü: Tokenlist 'verified' ise ve on-chain sembolü yok/kısa/şüpheli ise tokenlist'i tercih et.

export type TokenMeta = {
  symbol: string | null;
  name: string | null;
  logoURI?: string | null;
  verified?: boolean;
  source?: 'onchain' | 'tokenlist' | 'mixed' | 'fallback';
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Eski kötü cache'i kırmak için versiyonlayalım
const META_VER = 'v4';
const MEMO = new Map<string, TokenMeta>();

type ListRow = {
  symbol: string;
  name: string;
  logoURI?: string;
  verified?: boolean;
  decimals?: number | null;
};

function tidy(x: string | null | undefined) {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

function looksSuspicious(sym: string | null): boolean {
  if (!sym) return true;
  const s = sym.trim();
  // 1–2 karakterli “ZN” gibi semboller çoğunlukla hatalı/placeholder oluyor
  if (s.length <= 2) return true;
  // “UNKNOWN”, “TOKEN”, “N/A” gibi kalıpları da istersen ekleyebilirsin
  return false;
}

async function fetchOnchainMeta(
  mint: string,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<{ symbol: string | null; name: string | null } | null> {
  try {
    const r = await fetch(
      `/api/tokenmeta?mint=${mint}&cluster=${cluster}&_=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok) return null;
    return { symbol: tidy(j.symbol), name: tidy(j.name) };
  } catch {
    return null;
  }
}

async function fetchTokenMap(): Promise<Record<string, ListRow> | null> {
  try {
    const r = await fetch('/api/tokenlist', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return (j?.data as Record<string, ListRow>) ?? null;
  } catch {
    return null;
  }
}

export async function getTokenMeta(
  mint: string,
  _hintSymbol?: string | null,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<TokenMeta> {
  const key = `${META_VER}:${cluster}:${mint}`;
  const hit = MEMO.get(key);
  if (hit) return hit;

  // WSOL hızlı dönüş
  if (mint === WSOL_MINT) {
    const sol: TokenMeta = {
      symbol: 'SOL',
      name: 'Solana',
      logoURI: null,
      verified: true,
      source: 'fallback',
    };
    MEMO.set(key, sol);
    return sol;
  }

  // 1) Kaynakları topla
  const [oc, map] = await Promise.all([
    fetchOnchainMeta(mint, cluster),
    fetchTokenMap(),
  ]);

  const row = map?.[mint] || null;

  // Adaylar
  const ocSymbol = tidy(oc?.symbol);
  const ocName = tidy(oc?.name);
  const tlSymbol = tidy(row?.symbol);
  const tlName = tidy(row?.name);
  const tlLogo = row?.logoURI ?? null;
  const tlVerified = Boolean(row?.verified);

  // 2) Çatışma çözümü — KURAL:
  // - Eğer tokenlist verified ise VE:
  //   * on-chain sembol yoksa, YA DA
  //   * on-chain sembol "şüpheli" (<=2 uzunluk vs.)
  //   => tokenlist sembolünü TERCIH ET.
  // - Aksi halde on-chain'i tercih et (mevzuat gereği zinciri önde tutmak isteyebiliriz).
  let symbol: string | null = null;
  let name: string | null = null;
  let logoURI: string | null = null;
  let verified = false;
  let source: TokenMeta['source'] = 'fallback';

  const shouldPreferTokenlist =
    tlVerified && (ocSymbol == null || looksSuspicious(ocSymbol));

  if (shouldPreferTokenlist && tlSymbol) {
    // Tokenlist sembolü (doğrulanmış) — isim on-chain ya da listeden
    symbol = tlSymbol;
    name = ocName ?? tlName ?? null;
    logoURI = tlLogo;
    verified = true;
    source = ocSymbol || ocName ? 'mixed' : 'tokenlist';
  } else {
    // On-chain öncelikli
    symbol = ocSymbol ?? tlSymbol ?? null;
    name = ocName ?? tlName ?? null;
    logoURI = tlLogo;
    verified = tlVerified;
    source = ocSymbol || ocName ? 'onchain' : (tlSymbol || tlName ? 'tokenlist' : 'fallback');
  }

  const out: TokenMeta = { symbol, name, logoURI, verified, source };
  MEMO.set(key, out);
  return out;
}
