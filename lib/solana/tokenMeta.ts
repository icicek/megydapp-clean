// lib/solana/tokenMeta.ts
// Nihai kural (pragmatik):
// 1) Tokenlist (/api/tokenlist) varsa, oradaki symbol/name HER ZAMAN öncelikli.
// 2) On-chain (/api/tokenmeta) sadece tokenlist'te eksik olan alanları tamamlar.
// 3) Son çare: null (UI zaten mint kısaltmasına düşecek).

export type TokenMeta = {
  symbol: string | null;
  name: string | null;
  logoURI?: string | null;
  verified?: boolean;
  source?: 'tokenlist' | 'onchain' | 'mixed' | 'fallback';
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Eski cache'leri kırmak için versiyon artır
const META_VER = 'v5';
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

async function fetchOnchainMeta(
  mint: string,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<{ symbol: string | null; name: string | null } | null> {
  try {
    // Cache bypass
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

// İsteğe bağlı: birkaç yüksek profilli alias (tokenlist boşsa son çare)
// POPCAT
const OVERRIDES: Record<string, { symbol: string; name?: string }> = {
  '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr': { symbol: 'POPCAT', name: 'POPCAT' },
};

export async function getTokenMeta(
  mint: string,
  _hintSymbol?: string | null,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<TokenMeta> {
  const key = `${META_VER}:${cluster}:${mint}`;
  const hit = MEMO.get(key);
  if (hit) return hit;

  // SOL hızlı dönüş
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

  // 1) İlk olarak TOKENLIST — daima öncelikli gerçek
  const map = await fetchTokenMap();
  const row = map?.[mint] ?? null;
  let tlSymbol = tidy(row?.symbol);
  let tlName = tidy(row?.name);
  const tlLogo = row?.logoURI ?? null;
  const tlVerified = Boolean(row?.verified);

  // 2) On-chain sadece eksikleri tamamlamak için
  const oc = await fetchOnchainMeta(mint, cluster);
  const ocSymbol = tidy(oc?.symbol);
  const ocName = tidy(oc?.name);

  let symbol: string | null = null;
  let name: string | null = null;
  let logoURI: string | null = null;
  let verified = false;
  let source: TokenMeta['source'] = 'fallback';

  if (tlSymbol || tlName) {
    // Tokenlist varsa: sembol ve ismi tokenlist'ten al
    symbol = tlSymbol ?? null;
    name = tlName ?? null;
    logoURI = tlLogo;
    verified = tlVerified;
    // Eksikse on-chain ile TAMAMLA (EZME!)
    if (!symbol && ocSymbol) symbol = ocSymbol;
    if (!name && ocName) name = ocName;
    source = ocSymbol || ocName ? 'mixed' : 'tokenlist';
  } else {
    // Tokenlist yoksa: on-chain
    symbol = ocSymbol ?? null;
    name = ocName ?? null;
    logoURI = null;
    verified = false;
    source = 'onchain';

    // On-chain de yoksa, OVERRIDES
    if (!symbol) {
      const o = OVERRIDES[mint];
      if (o?.symbol) {
        symbol = o.symbol;
        name = name ?? o.name ?? null;
        source = 'fallback';
      }
    }
  }

  const out: TokenMeta = { symbol, name, logoURI, verified, source };
  MEMO.set(key, out);
  return out;
}
