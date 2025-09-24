// hooks/useWalletTokens.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { connection } from '@/lib/solanaConnection';
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

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);        // only for initial loads
  const [refreshing, setRefreshing] = useState(false);  // background updates
  const [error, setError] = useState<string | null>(null); // only for initial load errors

  const inflightRef = useRef(false);

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

    // UI states
    if (!hasLoadedOnce && !silent) setLoading(true);
    if (hasLoadedOnce && silent) setRefreshing(true);

    try {
      // 1) Scan both Token Program and Token-2022
      const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
      const results = await Promise.all(
        programs.map((programId) =>
          connection.getParsedTokenAccountsByOwner(publicKey, { programId })
        )
      );
      const allAccounts = results.flatMap((r) => r.value);

      // 2) Collect positive balances
      const tokenListRaw: TokenInfo[] = allAccounts
        .map(({ account }) => {
          const parsed = (account as any).data.parsed;
          return {
            mint: parsed.info.mint as string,
            amount: parseFloat(parsed.info.tokenAmount?.uiAmountString || '0'),
          };
        })
        .filter((t) => (t.amount ?? 0) > 0);

      // 3) Add native SOL
      const lamports = await connection.getBalance(publicKey);
      if (lamports > 0) {
        tokenListRaw.unshift({ mint: 'SOL', amount: lamports / 1e9, symbol: 'SOL' });
      }

      // 4) Enrich with symbol/logo (Jupiter + Registry + fallback), case-insensitive
      const list = await fetchSolanaTokenList(); // <- yeni güçlü liste
      const metaMap = new Map(list.map((m) => [m.address.toLowerCase(), m]));

      const enriched = await Promise.all(
        tokenListRaw.map(async (token) => {
          if (token.mint === 'SOL') return token;

          const meta = metaMap.get(token.mint.toLowerCase());
          if (meta?.symbol || meta?.logoURI) {
            return {
              ...token,
              symbol: meta.symbol || token.symbol || token.mint.slice(0, 4),
              logoURI: meta.logoURI,
            };
          }

          // Fallback: tekil metadata (ör. Helius, Solscan, vs. – client helper’ın döndürdüğü)
          try {
            const fallback = await fetchTokenMetadata(token.mint);
            if (fallback?.symbol || fallback?.logoURI) {
              return {
                ...token,
                symbol: fallback.symbol || token.mint.slice(0, 4),
                logoURI: fallback.logoURI,
              };
            }
          } catch {
            // ignore
          }

          // En kötü ihtimalle mint'in kısa hali
          return { ...token, symbol: token.mint.slice(0, 4) };
        })
      );

      setTokens(enriched);
      setHasLoadedOnce(true);
      if (!silent) setError(null);
    } catch (e: any) {
      if (!silent || !hasLoadedOnce) {
        setError(e?.message || 'Failed to fetch tokens');
      }
    } finally {
      inflightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [publicKey, connected, hasLoadedOnce]);

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
  }, [publicKey, connected, doFetch]);

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
