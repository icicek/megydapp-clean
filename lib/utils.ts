// lib/utils.ts
import { TokenListProvider, ENV, type TokenInfo as SplTokenInfo } from '@solana/spl-token-registry';

export interface SolanaToken {
  address: string;
  symbol: string;
  name?: string;
  logoURI?: string;
  decimals?: number;
  tags?: string[];
}

let _cache: SolanaToken[] | null = null;
let _cacheAt = 0;
// 10 dakika cache
const TTL_MS = 10 * 60 * 1000;

/**
 * Solana token listesi:
 * 1) Jupiter (https://token.jup.ag/all) — en kapsamlı kaynak
 * 2) spl-token-registry (MainnetBeta) — eksikleri tamamlar
 * Case-insensitive merge + basit bellek içi cache.
 */
export async function fetchSolanaTokenList(force = false): Promise<SolanaToken[]> {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < TTL_MS) return _cache;

  const byAddr = new Map<string, SolanaToken>(); // key: mint lower-case

  // 1) Jupiter
  try {
    const res = await fetch('https://tokens.jup.ag/strict', { cache: 'force-cache' });
    if (res.ok) {
      const arr = (await res.json()) as Array<{
        address: string;
        symbol?: string;
        name?: string;
        logoURI?: string;
        decimals?: number;
        tags?: string[];
      }>;
      for (const t of arr) {
        if (!t?.address) continue;
        byAddr.set(t.address.toLowerCase(), {
          address: t.address,
          symbol: t.symbol ?? t.address.slice(0, 4),
          name: t.name,
          logoURI: t.logoURI,
          decimals: t.decimals,
          tags: t.tags,
        });
      }
    }
  } catch (e) {
    // sessizce geç
    // console.warn('Jupiter list error', e);
  }

  // 2) spl-token-registry (MainnetBeta)
  try {
    const provider = new TokenListProvider();
    const container = await provider.resolve();
    const list = container.filterByChainId(ENV.MainnetBeta).getList() as SplTokenInfo[];
    for (const t of list) {
      if (!t?.address) continue;
      const k = t.address.toLowerCase();
      if (!byAddr.has(k)) {
        byAddr.set(k, {
          address: t.address,
          symbol: t.symbol ?? t.address.slice(0, 4),
          name: t.name,
          logoURI: t.logoURI,
          decimals: (t as any)?.decimals,
          tags: (t as any)?.tags,
        });
      }
    }
  } catch (e) {
    // console.warn('Registry list error', e);
  }

  _cache = Array.from(byAddr.values());
  _cacheAt = Date.now();
  return _cache;
}
