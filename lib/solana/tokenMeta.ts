// lib/solana/tokenMeta.ts
export type TokenMeta = {
  symbol: string | null;
  name: string | null;
  logoURI?: string | null;
  verified?: boolean;
  source?: string;
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const META_VER = 'v12';
const MEMO = new Map<string, TokenMeta>();

function tidy(x: string | null | undefined) {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

function sanitizeSym(s: string | null) {
  if (!s) return null;
  const z = s.toUpperCase().replace(/[^A-Z0-9.$_/-]/g, '').slice(0, 16);
  return z || null;
}

function normalizeMeta(input: any): TokenMeta {
  const symbol = sanitizeSym(tidy(input?.symbol));
  const name = tidy(input?.name) || symbol || null;
  const logoURI = tidy(input?.logoURI);
  const source = tidy(input?.source) || 'symbol';

  return {
    symbol,
    name,
    logoURI,
    verified: Boolean(symbol || name),
    source,
  };
}

export function clearTokenMetaMemo(mint?: string) {
  if (mint) {
    MEMO.delete(`${META_VER}:${mint}`);
    return;
  }
  MEMO.clear();
}

export async function getTokenMeta(
  mint: string,
  _hintSymbol?: string | null,
  _cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<TokenMeta> {
  const key = `${META_VER}:${mint}`;
  const cached = MEMO.get(key);
  if (cached) return cached;

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

  try {
    const r = await fetch(`/api/symbol?mint=${encodeURIComponent(mint)}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (r.ok) {
      const j = await r.json();
      const out = normalizeMeta(j);

      // Only memoize meaningful results
      if (out.symbol || out.name || out.logoURI) {
        MEMO.set(key, out);
      }

      return out;
    }
  } catch {
    // no-op
  }

  return {
    symbol: null,
    name: null,
    logoURI: null,
    verified: false,
    source: 'fallback',
  };
}