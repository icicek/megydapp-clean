// lib/solana/tokenMeta.ts
// Amaç: Mint için güvenilir {symbol, name, logoURI, verified} döndürmek.
// Sıra: 1) ON-CHAIN (/api/tokenmeta) 2) Tokenlist (/api/tokenlist) 3) Fallback (mint kısaltma)
// Not: Eski yanlış değerleri kırmak için versiyonlu memo kullanıyoruz.

export type TokenMeta = {
  symbol: string | null;
  name: string | null;
  logoURI?: string | null;
  verified?: boolean;
  source?: 'onchain' | 'tokenlist' | 'fallback';
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Eski hatalı cache'i kırmak için versiyonlayalım
const META_VER = 'v3'; // <- artırırsan tüm eski memo boşa düşer
const MEMO = new Map<string, TokenMeta>();

type ListRow = { symbol: string; name: string; logoURI?: string; verified?: boolean; decimals?: number | null };

function tidy(x: string | null | undefined) {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

async function fetchOnchainMeta(
  mint: string,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<{ symbol: string | null; name: string | null } | null> {
  try {
    // CDN / SWR olası cache'i bypass etmek için _ parametresi ekliyoruz
    const r = await fetch(`/api/tokenmeta?mint=${mint}&cluster=${cluster}&_=${Date.now()}`, {
      cache: 'no-store',
    });
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
    const sol: TokenMeta = { symbol: 'SOL', name: 'Solana', logoURI: null, verified: true, source: 'fallback' };
    MEMO.set(key, sol);
    return sol;
  }

  // 1) ON-CHAIN: Kesinlikle önce dene — varsa tokenlist'i EZER
  let symbol: string | null = null;
  let name: string | null = null;
  let logoURI: string | null = null;
  let verified = false;
  let source: TokenMeta['source'] = undefined;

  const oc = await fetchOnchainMeta(mint, cluster);
  if (oc && (oc.symbol || oc.name)) {
    symbol = tidy(oc.symbol) ?? null;
    name = tidy(oc.name) ?? null;
    source = 'onchain';
  }

  // 2) TOKENLIST: yalnızca EKSİK alanları tamamla (symbol/name doluysa dokunma)
  const map = await fetchTokenMap();
  const row = map?.[mint];
  if (row) {
    if (!symbol) symbol = tidy(row.symbol) ?? null;
    if (!name) name = tidy(row.name) ?? null;
    logoURI = row.logoURI ?? logoURI;
    verified = Boolean(row.verified);
    if (!source) source = 'tokenlist';
  }

  // 3) Fallback (mint kısaltması) — UI'da zaten kısaltma kullanıyoruz; yine de burada null bırakmak OK.
  const out: TokenMeta = { symbol, name, logoURI, verified, source: source ?? 'fallback' };
  MEMO.set(key, out);
  return out;
}
