// hooks/useWalletTokens.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { connection as fallbackConnection } from '@/lib/solanaConnection';
// (eski kaynaklar: en sona, son çare olarak bırakıyoruz)
import { fetchSolanaTokenList } from '@/lib/utils';
import { fetchTokenMetadataClient as fetchTokenMetadata } from '@/lib/client/fetchTokenMetadataClient';

export interface TokenInfo {
  mint: string;
  amount: number;
  uiAmountString?: string;
  decimals?: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
}

type Options = {
  autoRefetchOnFocus?: boolean;
  autoRefetchOnAccountChange?: boolean;
  pollMs?: number; // ms
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const DEBUG_TOKENS = process.env.NODE_ENV !== 'production';
const dbg = (...args: any[]) => {
  if (DEBUG_TOKENS) console.log('[TOKENS]', ...args);
};

/* -------------------------- Helpers & cache -------------------------- */

// -------------------------- Client-side tokens cache (cross-component) --------------------------
// This dedupes requests across multiple components using the hook.

type TokensCacheRow = { at: number; tokens: TokenInfo[] };
const TOKENS_MEMO = new Map<string, TokensCacheRow>();
const TOKENS_INFLIGHT = new Map<string, Promise<TokenInfo[]>>();

// 15s client TTL: prevents focus/visibility spam
const TOKENS_TTL_MS = 15_000;

function getOwnerKey(ownerBase58: string) {
  return `solana:${ownerBase58}`;
}

const tidy = (x: any) => {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
};

const sanitizeSym = (s: string | null) => {
  if (!s) return null;
  const z = s.toUpperCase().replace(/[^A-Z0-9.$_/-]/g, '').slice(0, 16);
  return z || null;
};

type SymCacheRow = { symbol: string | null; name: string | null; at: number; source?: string };
const SYM_MEMO = new Map<string, SymCacheRow>();
const SYM_TTL_MS = 5 * 60 * 1000; // 5 dk

// tokenlist map’i de hafifçe önbellekle
let TOKENLIST_MEMO: { at: number; map: Record<string, any> } | null = null;
const TOKENLIST_TTL_MS = 60 * 1000; // 60 sn

async function getTokenlistMap(): Promise<Record<string, any>> {
  const now = Date.now();
  if (TOKENLIST_MEMO && now - TOKENLIST_MEMO.at < TOKENLIST_TTL_MS) return TOKENLIST_MEMO.map;
  try {
    const r = await fetch('/api/tokenlist', { cache: 'force-cache' });
    const j = await r.json();
    const m = (j?.data as Record<string, any>) || {};
    TOKENLIST_MEMO = { at: now, map: m };
    return m;
  } catch {
    return {};
  }
}

// Bir mint için sembol çöz: tokenlist → /api/symbol → (son çare) fetchTokenMetadata
async function resolveSymbolForMint(mint: string): Promise<{ symbol: string | null; name: string | null; source?: string }> {
  const now = Date.now();
  const c = SYM_MEMO.get(mint);
  if (c && now - c.at < SYM_TTL_MS) return { symbol: c.symbol, name: c.name, source: c.source };

  // 1) tokenlist
  try {
    const map = await getTokenlistMap();
    const row = map?.[mint];
    const sym1 = sanitizeSym(tidy(row?.symbol));
    const nm1 = tidy(row?.name);
    if (sym1 || nm1) {
      const out = { symbol: sym1, name: nm1, source: 'tokenlist' as const };
      SYM_MEMO.set(mint, { ...out, at: now });
      return out;
    }
  } catch {}

  // 2) /api/symbol (DexScreener → On-chain)
  try {
    const r = await fetch(`/api/symbol?mint=${encodeURIComponent(mint)}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const sym2 = sanitizeSym(tidy(j?.symbol));
      const nm2 = tidy(j?.name);
      const out = { symbol: sym2, name: nm2, source: tidy(j?.source) || 'symbol' };
      SYM_MEMO.set(mint, { ...out, at: now });
      return out;
    }
  } catch {}

  // 3) son çare: eski client metası
  try {
    const fb = await fetchTokenMetadata(mint);
    const sym3 = sanitizeSym(tidy(fb?.symbol));
    const nm3 = tidy(fb?.name);
    const out = { symbol: sym3, name: nm3, source: 'legacy' as const };
    SYM_MEMO.set(mint, { ...out, at: now });
    return out;
  } catch {}

  const out = { symbol: null, name: null, source: 'none' as const };
  SYM_MEMO.set(mint, { ...out, at: now });
  return out;
}

// Concurrency limiter (basit batching)
async function resolveManySymbols(mints: string[], batchSize = 4) {
  const results = new Map<string, { symbol: string | null; name: string | null; source?: string }>();
  for (let i = 0; i < mints.length; i += batchSize) {
    const batch = mints.slice(i, i + batchSize);
    const rows = await Promise.all(batch.map((m) => resolveSymbolForMint(m)));
    rows.forEach((r, idx) => results.set(batch[idx], r));
  }
  return results;
}

/** raw u64 (string) + decimals -> ui string (BigInt/float kullanmadan) */
function rawToUiString(raw: string, decimals: number): string {
  if (!raw) return '0';
  const s = String(raw).replace(/^0+/, '') || '0';
  if (!decimals) return s;
  if (s.length <= decimals) {
    const zeros = '0'.repeat(decimals - s.length);
    const frac = (zeros + s).replace(/0+$/, '');
    return frac ? `0.${frac}` : '0';
  }
  const int = s.slice(0, s.length - decimals) || '0';
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

function fallbackSymbolFromMint(mint: string): string {
  if (!mint) return 'TOKEN';
  if (mint === WSOL_MINT || mint === 'SOL') return 'SOL';
  return mint.slice(0, 6).toUpperCase();
}

export function useWalletTokens(options?: Options) {
  const { publicKey, connected } = useWallet();
  const { connection: providerConnection } = useConnection();
  const connection = providerConnection ?? fallbackConnection;

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflightRef = useRef(false);
  const reqIdRef = useRef(0);

  const autoRefetchOnFocus = options?.autoRefetchOnFocus ?? true;
  const autoRefetchOnAccountChange = options?.autoRefetchOnAccountChange ?? true;
  const pollMs = options?.pollMs;

  // ---- Client RPC helper (server route başarısızsa) ----
  const mapParsed = (accs: any[]) => {
    const out: { mint: string; amount: number; uiAmountString?: string; decimals?: number }[] = [];
    for (const { account } of accs) {
      try {
        const info = (account as any)?.data?.parsed?.info;
        const amt = info?.tokenAmount;
        const mint: string | undefined = info?.mint;
        if (!mint || !amt) continue;

        const decimals: number = Number(amt.decimals ?? 0);
        // JSON parsed alanları: uiAmountString > uiAmount > amount/decimals
        let uiStr: string | undefined = typeof amt.uiAmountString === 'string'
          ? amt.uiAmountString
          : (typeof amt.uiAmount === 'number' ? String(amt.uiAmount) : undefined);

        if (!uiStr) {
          const raw = typeof amt.amount === 'string' ? amt.amount : '0';
          uiStr = rawToUiString(raw, decimals);
        }

        const uiNum = Number(uiStr);
        if (Number.isFinite(uiNum) && uiNum > 0) {
          out.push({ mint, amount: uiNum, uiAmountString: uiStr, decimals });
        }
      } catch {
        // bu hesabı atla
      }
    }
    return out;
  };

  const clientRpcFetch = useCallback(async (owner: any) => {
    try {
      const [v1Res, v22Res] = await Promise.allSettled([
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, 'confirmed'),
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed'),
      ]);

      const v1 = v1Res.status === 'fulfilled' ? v1Res.value.value : [];
      const v22 = v22Res.status === 'fulfilled' ? v22Res.value.value : [];

      const positive = mapParsed([...v1, ...v22]);

      // Mint bazında miktarları birleştir
      const merged = new Map<string, { amount: number; uiAmountString?: string; decimals?: number }>();
      for (const t of positive) {
        const prev = merged.get(t.mint);
        if (!prev) merged.set(t.mint, { amount: t.amount, uiAmountString: t.uiAmountString, decimals: t.decimals });
        else merged.set(t.mint, {
          amount: prev.amount + t.amount,
          uiAmountString: (prev.uiAmountString && t.uiAmountString)
            ? String(Number(prev.uiAmountString) + Number(t.uiAmountString))
            : String(prev.amount + t.amount),
          decimals: t.decimals ?? prev.decimals,
        });
      }

      // Native SOL
      try {
        const lamports = await connection.getBalance(owner, 'confirmed');
        if (lamports > 0) {
          merged.set(WSOL_MINT, {
            amount: lamports / 1e9,
            uiAmountString: rawToUiString(String(lamports), 9),
            decimals: 9,
          });
        }
      } catch {}

      return Array.from(merged.entries())
        .map(([mint, v]) => ({ mint, amount: v.amount, uiAmountString: v.uiAmountString, decimals: v.decimals }))
        .sort((a, b) => b.amount - a.amount);
    } catch (e) {
      dbg('clientRpcFetch error', e);
      return [];
    }
  }, [connection]);

  function clearOwnerTokenCache(ownerBase58: string) {
    const key = getOwnerKey(ownerBase58);
    TOKENS_MEMO.delete(key);
    TOKENS_INFLIGHT.delete(key);
  }
  
  const doFetch = useCallback(async (silent: boolean) => {
    if (!publicKey || !connected) {
      setTokens([]);
      setHasLoadedOnce(false);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;
    const myReq = ++reqIdRef.current;

    if (!hasLoadedOnce && !silent) setLoading(true);
    if (hasLoadedOnce && silent) setRefreshing(true);

    try {
      const owner = publicKey.toBase58();
      dbg('Owner', owner);
    
      // ------------------ 1) Cross-component memo/inflight (client-side) ------------------
      let tokenListRaw: TokenInfo[] = [];
      const key = getOwnerKey(owner);
      const now = Date.now();
    
      // Silent refresh ise 15sn içinde tekrar fetch yapma (UI spam’i keser)
      if (silent) {
        const hot = TOKENS_MEMO.get(key);
        if (hot && now - hot.at < TOKENS_TTL_MS) {
          dbg('client memo HIT', key);
          tokenListRaw = hot.tokens;
        }
      }
    
      // Eğer memo’dan gelmediyse: inflight varsa ona katıl
      if (!tokenListRaw.length) {
        const existing = TOKENS_INFLIGHT.get(key);
        if (existing) {
          dbg('client inflight JOIN', key);
          tokenListRaw = await existing;
        } else {
          // Yeni bir fetch başlat
          const p = (async (): Promise<TokenInfo[]> => {
            // 2) FIRST: SERVER ROUTE
            try {
                const res = await fetch(`/api/solana/tokens?owner=${owner}&tag=home`, {
                  cache: 'no-store',
                  headers: {
                    'x-cc-source': 'useWalletTokens',
                    'x-cc-page': 'HomePage',
                  },
                });
    
              if (res.ok) {
                const data = await res.json();
                if (data?.success && Array.isArray(data.tokens)) {
                  const list = data.tokens as TokenInfo[];
                  dbg('server route tokens', list.length);
                  TOKENS_MEMO.set(key, { at: Date.now(), tokens: list });
                  return list;
                } else {
                  dbg('server route bad response', data);
                }
              } else {
                dbg('server route HTTP', res.status);
              }
            } catch (e) {
              dbg('server route fetch failed', e);
            }
    
            // 3) FALLBACK: CLIENT RPC (expensive) — only if server route failed
            dbg('fallback to client RPC (may 403 in browser)');
            const rpcList = await clientRpcFetch(publicKey).catch(() => []);
    
            const list = rpcList.map((t) => ({
              mint: t.mint,
              amount: t.amount,
              uiAmountString: t.uiAmountString,
              decimals: t.decimals,
            })) as TokenInfo[];
    
            TOKENS_MEMO.set(key, { at: Date.now(), tokens: list });
            return list;
          })();
    
          TOKENS_INFLIGHT.set(key, p);
          try {
            tokenListRaw = await p;
          } finally {
            TOKENS_INFLIGHT.delete(key);
          }
        }
      }
    
      // ------------------ 2) İlk anda ham/erken göster (mint kısaltması ile) ------------------
      if (reqIdRef.current === myReq) {
        setTokens(
          tokenListRaw.map((t) => {
            const isSol = t.mint === 'SOL' || t.mint === WSOL_MINT;
            return isSol
              ? { ...t, mint: WSOL_MINT, symbol: 'SOL', name: 'Solana' }
              : {
                  ...t,
                  symbol: t.symbol || t.name || fallbackSymbolFromMint(t.mint),
                };
          })
        );
        setHasLoadedOnce(true);
        if (!silent) setError(null);
      }
      
      if (!tokenListRaw.length) {
        if (reqIdRef.current === myReq) setTokens([]);
        return;
      }
      // ------------------ 3) Metadata zenginleştirme ------------------
      const nonSolMints = tokenListRaw
        .filter((t) => t.mint !== 'SOL' && t.mint !== WSOL_MINT)
        .map((t) => t.mint);
    
      const symMap = await resolveManySymbols(nonSolMints, 4); // concurrency=4
    
      // (eski) utils token list’i sadece logo için son çare olarak dene
      let legacyMap: Map<string, any> | null = null;
      const needsLegacyLogo = tokenListRaw.some((t) => t.mint !== 'SOL' && t.mint !== WSOL_MINT && !t.logoURI);

      if (needsLegacyLogo) {
        try {
          const list = await fetchSolanaTokenList().catch(() => []);
          legacyMap = new Map(
            (list || []).map((m: any) => [String(m.address || '').toLowerCase(), m])
          );
        } catch {}
      }
    
      const enriched = await Promise.all(
        tokenListRaw.map(async (token) => {
          const isSol = token.mint === 'SOL' || token.mint === WSOL_MINT;
          if (isSol) return { ...token, mint: WSOL_MINT, symbol: 'SOL' };
    
          const resolved = symMap.get(token.mint) || { symbol: null, name: null };
          const symbol =
            resolved.symbol ||
            resolved.name ||
            token.symbol ||
            token.name ||
            fallbackSymbolFromMint(token.mint);
    
          // legacy logo (varsa)
          let logoURI: string | undefined = token.logoURI;
          if (!logoURI && legacyMap) {
            const meta = legacyMap.get(token.mint.toLowerCase());
            if (meta?.logoURI) logoURI = meta.logoURI;
          }
    
          return {
            ...token,
            symbol,
            name: resolved.name || token.name,
            logoURI,
          };
        })
      );
    
      if (reqIdRef.current !== myReq) return;
      setTokens(enriched);
    } catch (e: any) {
      if (!silent || !hasLoadedOnce) {
        setError('Could not fetch wallet tokens');
      }
    } finally {
      if (reqIdRef.current === myReq) {
        setLoading(false);
        setRefreshing(false);
      }
      inflightRef.current = false;
    }
  }, [publicKey, connected, hasLoadedOnce, clientRpcFetch]);

  const refetchTokens = useCallback(async () => {
    if (publicKey) {
      clearOwnerTokenCache(publicKey.toBase58());
    }
    await doFetch(false);
  }, [doFetch, publicKey]);

  // İlk yükleme / cüzdan değişimi
  useEffect(() => {
    if (publicKey && connected) {
      doFetch(false);
    } else {
      setTokens([]);
      setHasLoadedOnce(false);
      setLoading(false);
      setRefreshing(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey?.toBase58()]);

  // Arka plan senkron
  useEffect(() => {
    if (!connected) return;

    let debounceTimer: any = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (document.visibilityState === 'visible') doFetch(true);
      }, 350);
    };
    const onVis = () => { if (document.visibilityState === 'visible') debouncedFetch(); };
    const onFocus = () => debouncedFetch();
    const provider = (typeof window !== 'undefined' ? (window as any).solana : null);
    const onAcc = () => debouncedFetch();

    if (autoRefetchOnFocus) {
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('focus', onFocus);
    }
    if (autoRefetchOnAccountChange) {
      provider?.on?.('accountChanged', onAcc);
    }

    let t: any, stop = false;
    if (typeof pollMs === 'number' && pollMs > 0) {
      const loop = async () => {
        try { if (document.visibilityState === 'visible') await doFetch(true); }
        finally { if (!stop) t = setTimeout(loop, pollMs); }
      };
      t = setTimeout(loop, pollMs);
    }

    return () => {
      if (autoRefetchOnFocus) {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('focus', onFocus);
      }
      if (autoRefetchOnAccountChange) {
        provider?.removeListener?.('accountChanged', onAcc);
      }
      stop = true;
      if (t) clearTimeout(t);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [connected, doFetch, autoRefetchOnFocus, autoRefetchOnAccountChange, pollMs]);

  return {
    tokens,
    loading,
    refreshing,
    error,
    refetchTokens,
  };
}
