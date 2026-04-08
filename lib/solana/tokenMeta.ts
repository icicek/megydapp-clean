// lib/solana/tokenMeta.ts
export type TokenMeta = {
  symbol: string | null;
  name: string | null;
  logoURI?: string | null;
  verified?: boolean;
  source?: string;
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const META_VER = 'v11';
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
    });

    if (r.ok) {
      const j = await r.json();
      const out: TokenMeta = {
        symbol: sanitizeSym(tidy(j?.symbol)),
        name: tidy(j?.name),
        logoURI: tidy(j?.logoURI),
        verified: Boolean(j?.symbol || j?.name),
        source: tidy(j?.source) || 'symbol',
      };
      MEMO.set(key, out);
      return out;
    }
  } catch {}

  const out: TokenMeta = {
    symbol: null,
    name: null,
    logoURI: null,
    verified: false,
    source: 'fallback',
  };
  MEMO.set(key, out);
  return out;
}