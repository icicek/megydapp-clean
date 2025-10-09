// hooks/useWalletTokens.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { connection as fallbackConnection } from '@/lib/solanaConnection';
import { fetchSolanaTokenList } from '@/lib/utils';
import { fetchTokenMetadataClient as fetchTokenMetadata } from '@/lib/client/fetchTokenMetadataClient';

export interface TokenInfo {
  mint: string;
  amount: number;
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

  // ---- Client RPC helper (sadece server route yoksa kullanılır) ----
  const mapParsed = (accs: any[]) => {
    const out: { mint: string; amount: number }[] = [];
    for (const { account } of accs) {
      const info = (account as any)?.data?.parsed?.info;
      const amt = info?.tokenAmount;
      const mint: string | undefined = info?.mint;
      if (!mint || !amt) continue;

      const decimals = Number(amt.decimals ?? 0);
      let ui = typeof amt.uiAmount === 'number' ? amt.uiAmount : undefined;
      if (ui == null) {
        const raw = typeof amt.amount === 'string' ? amt.amount : '0';
        try { ui = Number(BigInt(raw)) / Math.pow(10, decimals); }
        catch { ui = Number(raw) / Math.pow(10, decimals); }
      }
      if (ui > 0) out.push({ mint, amount: ui });
    }
    return out;
  };

  const clientRpcFetch = useCallback(async (owner: any) => {
    // 403 riski nedeniyle yalnızca server route olmazsa deneyelim
    try {
      const [v1Res, v22Res] = await Promise.allSettled([
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, 'confirmed'),
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed'),
      ]);
      const v1 = v1Res.status === 'fulfilled' ? v1Res.value.value : [];
      const v22 = v22Res.status === 'fulfilled' ? v22Res.value.value : [];
      const positive = mapParsed([...v1, ...v22]);

      const merged = new Map<string, number>();
      for (const t of positive) merged.set(t.mint, (merged.get(t.mint) ?? 0) + t.amount);

      try {
        const lamports = await connection.getBalance(owner, 'confirmed');
        if (lamports > 0) merged.set('SOL', (merged.get('SOL') ?? 0) + lamports / 1e9);
      } catch {}

      return Array.from(merged.entries())
        .map(([mint, amount]) => ({ mint, amount }))
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

      // 1) ÖNCE SERVER ROUTE (403/CORS yok, API key gizli)
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

      // 2) Server route başarısızsa CLIENT RPC dene (son çare)
      if (!tokenListRaw.length) {
        dbg('fallback to client RPC (may 403 in browser)');
        tokenListRaw = await clientRpcFetch(publicKey);
      }

      // 3) İlk anda ham/erken göster
      if (reqIdRef.current === myReq) {
        setTokens(
          tokenListRaw.map((t) =>
            t.mint === 'SOL' ? { ...t, symbol: 'SOL' } : { ...t, symbol: t.symbol || t.mint.slice(0, 4) }
          )
        );
        setHasLoadedOnce(true);
        if (!silent) setError(null);
      }

      // 4) Metadata zenginleştirme
      const list = await fetchSolanaTokenList().catch(() => []);
      const metaMap = new Map(list.map((m: any) => [String(m.address).toLowerCase(), m]));

      const enriched = await Promise.all(
        tokenListRaw.map(async (token) => {
          if (token.mint === 'SOL') return { ...token, symbol: 'SOL' };

          const meta = token.mint !== 'SOL' ? metaMap.get(token.mint.toLowerCase()) : null;
          if (meta?.symbol || meta?.logoURI) {
            return {
              ...token,
              symbol: meta.symbol || token.symbol || token.mint.slice(0, 4),
              logoURI: meta.logoURI || token.logoURI,
            };
          }
          try {
            const fb = await fetchTokenMetadata(token.mint);
            if (fb?.symbol || fb?.logoURI) {
              return {
                ...token,
                symbol: fb.symbol || token.symbol || token.mint.slice(0, 4),
                logoURI: fb.logoURI || token.logoURI,
              };
            }
          } catch {}
          return { ...token, symbol: token.symbol || token.mint.slice(0, 4) };
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
