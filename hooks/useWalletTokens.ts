// hooks/useWalletTokens.ts
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  /** Background polling in ms (e.g., 20000). Omit to disable. */
  pollMs?: number;
};

export function useWalletTokens(options?: Options) {
  const { publicKey, connected } = useWallet();

  // ÖNEMLİ: WalletAdapter Provider'daki connection'ı tercih et
  // (ör. devnet/mainnet uyumsuzluğu yaşamamak için)
  const fromProvider = (() => {
    try {
      // useConnection hook'u bazı ortamlarda opsiyonel olabilir; hata güvenli kullanıyoruz
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const h = useConnection as unknown as () => { connection?: any };
      // @ts-ignore (runtime güvence: varsa döner)
      return typeof h === 'function' ? h() : { connection: undefined };
    } catch {
      return { connection: undefined as any };
    }
  })();

  const connection = fromProvider?.connection ?? fallbackConnection;

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);        // only for initial loads
  const [refreshing, setRefreshing] = useState(false);  // background updates
  const [error, setError] = useState<string | null>(null); // only for initial load errors

  const inflightRef = useRef(false);
  const reqIdRef = useRef(0); // latest-only guard

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
    const myId = ++reqIdRef.current;

    // UI states
    if (!hasLoadedOnce && !silent) setLoading(true);
    if (hasLoadedOnce && silent) setRefreshing(true);

    try {
      const owner = publicKey;
      const commitment: 'confirmed' = 'confirmed';

      // 1) İki programı da tara — ayrı ayrı güvenli
      const v1P = connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, commitment);
      const v22P = connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, commitment);

      const [v1Res, v22Res] = await Promise.allSettled([v1P, v22P]);

      const allAccounts: any[] = [];
      if (v1Res.status === 'fulfilled') allAccounts.push(...v1Res.value.value);
      if (v22Res.status === 'fulfilled') allAccounts.push(...v22Res.value.value);

      // 2) Hesapları sayıya çevir (uiAmountString yoksa amount/10^decimals)
      const positive: { mint: string; amount: number }[] = [];
      for (const { account } of allAccounts) {
        const parsed = (account as any)?.data?.parsed?.info;
        const amt = parsed?.tokenAmount;
        const mint: string | undefined = parsed?.mint;
        if (!mint || !amt) continue;

        const decimals = Number(amt.decimals ?? 0);
        let ui = typeof amt.uiAmount === 'number' ? amt.uiAmount : undefined;
        if (ui === undefined) {
          const raw = typeof amt.amount === 'string' ? amt.amount : '0';
          // BigInt → Number (tipik bakiyeler için güvenli)
          try {
            ui = Number(BigInt(raw)) / Math.pow(10, decimals);
          } catch {
            ui = Number(raw) / Math.pow(10, decimals);
          }
        }
        if (ui && ui > 0) positive.push({ mint, amount: ui });
      }

      // 3) Aynı mint'leri birleştir (topla)
      const merged = new Map<string, number>();
      for (const t of positive) {
        merged.set(t.mint, (merged.get(t.mint) ?? 0) + t.amount);
      }

      // 4) Native SOL ekle
      try {
        const lamports = await connection.getBalance(owner, commitment);
        if (lamports > 0) {
          merged.set('SOL', (merged.get('SOL') ?? 0) + lamports / 1e9);
        }
      } catch { /* ignore */ }

      // 5) Ham listeyi sırala (SOL en üste gelsin diye önce array'e çevirip sonra SOL'u öne alıyoruz)
      const tokenListRaw: TokenInfo[] = Array.from(merged.entries())
        .map(([mint, amount]) => ({ mint, amount }))
        .sort((a, b) => b.amount - a.amount);

      // 6) Meta zenginleştirme (Jupiter + Registry + fallback)
      const list = await fetchSolanaTokenList();
      const metaMap = new Map(list.map((m) => [m.address.toLowerCase(), m]));

      const enriched = await Promise.all(
        tokenListRaw.map(async (token) => {
          if (token.mint === 'SOL') {
            return { ...token, symbol: 'SOL', logoURI: token.logoURI };
          }

          const meta = metaMap.get(token.mint.toLowerCase());
          if (meta?.symbol || meta?.logoURI) {
            return {
              ...token,
              symbol: meta.symbol || token.mint.slice(0, 4),
              logoURI: meta.logoURI,
            };
          }

          // Fallback: tekil metadata
          try {
            const fallback = await fetchTokenMetadata(token.mint);
            if (fallback?.symbol || fallback?.logoURI) {
              return {
                ...token,
                symbol: fallback.symbol || token.mint.slice(0, 4),
                logoURI: fallback.logoURI,
              };
            }
          } catch { /* ignore */ }

          // En kötü: kısa mint
          return { ...token, symbol: token.mint.slice(0, 4) };
        })
      );

      // latest-only guard
      if (reqIdRef.current !== myId) return;

      setTokens(enriched);
      setHasLoadedOnce(true);
      if (!silent) setError(null);
    } catch (e: any) {
      if (!silent || !hasLoadedOnce) {
        setError(e?.message || 'Failed to fetch tokens');
      }
    } finally {
      if (reqIdRef.current === myId) {
        setLoading(false);
        setRefreshing(false);
      }
      inflightRef.current = false;
    }
  }, [publicKey, connected, hasLoadedOnce, connection]);

  // Public API for manual refetch (foreground intent)
  const refetchTokens = useCallback(async () => {
    await doFetch(false);
  }, [doFetch]);

  // Trigger on connect / wallet change (foreground)
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
  }, [publicKey?.toBase58(), connected]); // owner değişimi doğru algılansın

  // Auto-refetch on focus / accountChanged / optional polling (background/silent)
  useEffect(() => {
    if (!connected) return;
    const { autoRefetchOnFocus = true, autoRefetchOnAccountChange = true, pollMs } = options || {};

    const onVis = () => {
      if (document.visibilityState === 'visible') doFetch(true);
    };
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
        try {
          if (document.visibilityState === 'visible') {
            await doFetch(true);
          }
        } finally {
          if (!stop) t = setTimeout(loop, pollMs);
        }
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
    loading,       // only for initial load
    refreshing,    // background sync (no flicker)
    error,         // only initial fetch errors
    refetchTokens,
  };
}
