// lib/solana/tokenMeta.ts
export type TokenMeta = { symbol: string; name?: string; logoURI?: string; verified?: boolean };

declare global {
  // HMR koruması
  // eslint-disable-next-line no-var
  var __CC_TOKEN_META__: {
    map: Record<string, TokenMeta>;
    loadedList: boolean;
    loadingList?: Promise<void>;
  } | undefined;
}
if (!globalThis.__CC_TOKEN_META__) {
  globalThis.__CC_TOKEN_META__ = { map: {}, loadedList: false };
}
const store = globalThis.__CC_TOKEN_META__!;

async function loadTokenListOnce() {
  if (store.loadedList) return;
  if (!store.loadingList) {
    store.loadingList = fetch('/api/tokenlist', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('tokenlist 404')))
      .then(j => {
        const data = (j?.data || {}) as Record<string, any>;
        for (const [mint, v] of Object.entries<any>(data)) {
          store.map[mint] = {
            symbol: v.symbol,
            name: v.name,
            logoURI: v.logoURI,
            verified: !!v.verified,
          };
        }
        store.loadedList = true;
      })
      .catch(() => { store.loadedList = true; }); // yoksa da sorun değil
  }
  await store.loadingList;
}

async function fetchOnchain(mint: string) {
  try {
    const r = await fetch(`/api/tokenmeta?mints=${encodeURIComponent(mint)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    const hit = j?.data?.[mint];
    if (hit?.symbol) {
      store.map[mint] = { symbol: hit.symbol, name: hit.name };
    }
  } catch {}
}

export async function getTokenMeta(mint: string, fallbackSymbol?: string): Promise<TokenMeta> {
  await loadTokenListOnce();
  if (store.map[mint]?.symbol) return store.map[mint];

  // Liste yoksa on-chain dene
  await fetchOnchain(mint);
  if (store.map[mint]?.symbol) return store.map[mint];

  // En son: locale-safe fallback
  const sym = (fallbackSymbol || mint.slice(0, 4)).toLocaleUpperCase('en-US');
  return { symbol: sym };
}
