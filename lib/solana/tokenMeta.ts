// lib/solana/tokenMeta.ts
// Amaç: Mint için güvenilir {symbol, name, logoURI, verified} döndürmek.
// Sıra: 1) ON-CHAIN (/api/tokenmeta) 2) Tokenlist (/api/tokenlist) 3) Fallback
export type TokenMeta = {
  symbol: string | null;
  name: string | null;
  logoURI?: string | null;
  verified?: boolean;
  source?: 'onchain' | 'tokenlist' | 'fallback';
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Çok küçük bir client-side memo
const MEMO = new Map<string, TokenMeta>();

async function fetchOnchainMeta(
  mint: string,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<{ symbol: string | null; name: string | null } | null> {
  try {
    const r = await fetch(`/api/tokenmeta?mint=${mint}&cluster=${cluster}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok) return null;
    const symbol = (j.symbol as string | undefined) ?? null;
    const name = (j.name as string | undefined) ?? null;
    return { symbol: tidy(symbol), name: tidy(name) };
  } catch {
    return null;
  }
}

type ListRow = { symbol: string; name: string; logoURI?: string; verified?: boolean; decimals?: number | null };
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

function tidy(x: string | null | undefined) {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

export async function getTokenMeta(
  mint: string,
  hintSymbol?: string | null,
  cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<TokenMeta> {
  const key = `${cluster}:${mint}`;
  const hit = MEMO.get(key);
  if (hit) return hit;

  // WSOL için hızlı dönüş (sembol/isim sabit)
  if (mint === WSOL_MINT) {
    const sol: TokenMeta = { symbol: 'SOL', name: 'Solana', logoURI: null, verified: true, source: 'fallback' };
    MEMO.set(key, sol);
    return sol;
  }

  // 1) ON-CHAIN ÖNCE
  const oc = await fetchOnchainMeta(mint, cluster);
  let symbol = tidy(oc?.symbol) ?? null;
  let name = tidy(oc?.name) ?? null;
  let logoURI: string | null = null;
  let verified = false;
  let source: TokenMeta['source'] = oc && (oc.symbol || oc.name) ? 'onchain' : undefined;

  // 2) TOKENLIST (logo + eksik alanları tamamlama)
  const map = await fetchTokenMap();
  const row = map?.[mint];

  if (row) {
    // Eğer on-chain bir sembol döndüyse onu KORU; tokenlist yanlışsa ezmemek için.
    // Yalnızca symbol/name null ise tokenlist ile doldur.
    if (!symbol) symbol = tidy(row.symbol) ?? null;
    if (!name) name = tidy(row.name) ?? null;
    logoURI = row.logoURI ?? null;

    // Verified: tokenlist'ten gelen işareti kullan (on-chain meta'da böyle bir işaret yok)
    verified = Boolean(row.verified);

    // Kaynak işareti: sadece on-chain tamamen boşsa tokenlist deriz
    if (!source) source = 'tokenlist';
  }

  // 3) SON ÇARE
  if (!symbol) symbol = tidy(hintSymbol) ?? null;

  const out: TokenMeta = {
    symbol,
    name,
    logoURI,
    verified,
    source: source ?? 'fallback',
  };

  MEMO.set(key, out);
  return out;
}
