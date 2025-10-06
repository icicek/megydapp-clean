export type TokenMeta = { symbol: string; name?: string; logoURI?: string; verified?: boolean };

let TOKEN_MAP: Record<string, TokenMeta> | null = null;
let LOADING: Promise<void> | null = null;

async function ensure() {
  if (TOKEN_MAP) return;
  if (!LOADING) {
    LOADING = fetch('/api/tokenlist', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { TOKEN_MAP = j?.data || {}; });
  }
  await LOADING;
}

export async function getTokenMeta(mint: string, fallbackSymbol?: string): Promise<TokenMeta> {
  await ensure();
  const hit = TOKEN_MAP![mint];
  if (hit) return hit;
  // Locale bağımsız fallback → EN-US
  const sym = (fallbackSymbol || mint.slice(0, 4)).toLocaleUpperCase('en-US');
  return { symbol: sym };
}
