// lib/solana/tokenMeta.ts
// Authority-first strategy (sustainable):
// 1) Tokenlist (/api/tokenlist) is the ONLY source of truth for symbol/name.
// 2) On-chain (/api/tokenmeta) is used ONLY to fill missing fields
//    when there IS a tokenlist row for that mint.
// 3) If there is NO tokenlist row, we DO NOT trust on-chain metadata for symbol/name.
//    We return nulls so the UI falls back to mint-short (prevents wrong tickers).
// 4) Last resort: null (UI shows short mint).

export type TokenMeta = {
  symbol: string | null;
  name: string | null;
  logoURI?: string | null;
  verified?: boolean;
  source?: 'tokenlist' | 'onchain' | 'mixed' | 'fallback';
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// bump to invalidate stale caches
const META_VER = 'v8';

// per-tab memo
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

/**
 * Server-proxied token map built from trusted sources
 * (e.g., tokens.jup.ag/strict + your DB registry).
 * Shape: { [mint]: { symbol, name, logoURI?, verified?, decimals? } }
 */
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

/**
 * On-chain metadata via API proxy.
 * Used only to FILL MISSING FIELDS when tokenlist has a row.
 */
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

export async function getTokenMeta(
  mint: string,
  _hintSymbol?: string | null,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<TokenMeta> {
  const key = `${META_VER}:${cluster}:${mint}`;
  const cached = MEMO.get(key);
  if (cached) return cached;

  // Fast path for SOL
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

  // 1) Authoritative tokenlist
  const map = await fetchTokenMap();
  const row = map?.[mint] ?? null;
  const tlSymbol = tidy(row?.symbol);
  const tlName = tidy(row?.name);
  const tlLogo = row?.logoURI ?? null;
  const tlVerified = Boolean(row?.verified);

  // 2) If tokenlist has a row, we can use on-chain ONLY to fill gaps.
  let ocSymbol: string | null = null;
  let ocName: string | null = null;
  if (row) {
    const oc = await fetchOnchainMeta(mint, cluster);
    ocSymbol = tidy(oc?.symbol);
    ocName = tidy(oc?.name);
  }

  let symbol: string | null = null;
  let name: string | null = null;
  let logoURI: string | null = null;
  let verified = false;
  let source: TokenMeta['source'] = 'fallback';

  if (tlSymbol || tlName) {
    // Tokenlist is the source of truth
    symbol = tlSymbol ?? null;
    name = tlName ?? null;
    logoURI = tlLogo;
    verified = tlVerified;

    // Fill ONLY missing fields from on-chain
    if (!symbol && ocSymbol) symbol = ocSymbol;
    if (!name && ocName) name = ocName;

    source = (ocSymbol || ocName) ? 'mixed' : 'tokenlist';
  } else {
    // No tokenlist row → we DON'T trust on-chain names/symbols.
    // Return nulls so UI shows mint-short; prevents wrong tickers like "ZN".
    symbol = null;
    name = null;
    logoURI = null;
    verified = false;
    source = 'fallback';
  }

  const out: TokenMeta = { symbol, name, logoURI, verified, source };
  MEMO.set(key, out);
  return out;
}
