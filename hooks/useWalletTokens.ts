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
  amount: number;             // UI için sayı (liste sıralama vb.)
  uiAmountString?: string;    // Güvenli gösterim (string)
  decimals?: number;          // Gerekirse işlemde kullanılır
  symbol?: string;
  logoURI?: string;
}

type Options = {
  autoRefetchOnFocus?: boolean;
  autoRefetchOnAccountChange?: boolean;
  pollMs?: number; // ms
};

const DEBUG_TOKENS = true;
const dbg = (...args: any[]) => { if (DEBUG_TOKENS) console.log('[TOKENS]', ...args); };

/* -------------------------- Helpers & cache -------------------------- */

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
          merged.set('SOL', {
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

      // 1) ÖNCE SERVER ROUTE
      let tokenListRaw: TokenInfo[] = [];
      try {
        const res = await fetch(`/api/solana/tokens?owner=${owner}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.tokens)) {
            tokenListRaw = data.tokens as TokenInfo[];
            dbg('server route tokens', tokenListRaw.length);
          } else {
            dbg('server route bad response', data);
          }
        } else {
          dbg('server route HTTP', res.status);
        }
      } catch (e) {
        dbg('server route fetch failed', e);
      }

      // 2) Server route yoksa CLIENT RPC
      if (!tokenListRaw.length) {
        dbg('fallback to client RPC (may 403 in browser)');
        const rpcList = await clientRpcFetch(publicKey);
        tokenListRaw = rpcList.map((t) => ({
          mint: t.mint,
          amount: t.amount,
          uiAmountString: t.uiAmountString,
          decimals: t.decimals,
        }));
      }

      // 3) İlk anda ham/erken göster (mint kısaltması ile)
      if (reqIdRef.current === myReq) {
        setTokens(
          tokenListRaw.map((t) =>
            t.mint === 'SOL'
              ? { ...t, symbol: 'SOL' }
              : { ...t, symbol: t.symbol || t.mint.slice(0, 4) }
          )
        );
        setHasLoadedOnce(true);
        if (!silent) setError(null);
      }

      // 4) Metadata zenginleştirme — YENİ SIRALAMA:
      //    tokenlist → /api/symbol → (legacy fallback’lar)
      const nonSolMints = tokenListRaw.filter(t => t.mint !== 'SOL').map(t => t.mint);
      const symMap = await resolveManySymbols(nonSolMints, 4); // concurrency=4

      // (eski) utils token list’i sadece logo için son çare olarak dene
      let legacyMap: Map<string, any> | null = null;
      try {
        const list = await fetchSolanaTokenList().catch(() => []);
        legacyMap = new Map((list || []).map((m: any) => [String(m.address || '').toLowerCase(), m]));
      } catch {}

      const enriched = await Promise.all(
        tokenListRaw.map(async (token) => {
          if (token.mint === 'SOL') return { ...token, symbol: 'SOL' };

          const resolved = symMap.get(token.mint) || { symbol: null, name: null };
          let symbol = resolved.symbol || token.symbol || token.mint.slice(0, 4);

          // legacy logo (varsa)
          let logoURI: string | undefined = token.logoURI;
          if (!logoURI && legacyMap) {
            const meta = legacyMap.get(token.mint.toLowerCase());
            if (meta?.logoURI) logoURI = meta.logoURI;
          }

          return { ...token, symbol, logoURI };
        })
      );

      if (reqIdRef.current !== myReq) return;
      setTokens(enriched);
    } catch (e: any) {
      if (!silent || !hasLoadedOnce) setError(e?.message || 'Failed to fetch tokens');
    } finally {
      if (reqIdRef.current === myReq) {
        setLoading(false);
        setRefreshing(false);
      }
      inflightRef.current = false;
    }
  }, [publicKey, connected, hasLoadedOnce, clientRpcFetch]);

  const refetchTokens = useCallback(async () => {
    await doFetch(false);
  }, [doFetch]);

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
    const { autoRefetchOnFocus = true, autoRefetchOnAccountChange = true, pollMs } = options || {};

    const onVis = () => { if (document.visibilityState === 'visible') doFetch(true); };
    const onFocus = () => doFetch(true);
    const provider = (typeof window !== 'undefined' ? (window as any).solana : null);
    const onAcc = () => doFetch(true);

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
    };
  }, [connected, doFetch, options]);

  return {
    tokens,
    loading,
    refreshing,
    error,
    refetchTokens,
  };
}
