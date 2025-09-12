// hooks/useWalletTokens.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { connection } from '@/lib/solanaConnection';
import { fetchSolanaTokenList } from '@/lib/utils';
import { fetchTokenMetadata } from '@/app/api/utils/fetchTokenMetadata';

export interface TokenInfo {
  mint: string;
  amount: number;
  symbol?: string;
  logoURI?: string;
}

type Options = {
  autoRefetchOnFocus?: boolean;
  autoRefetchOnAccountChange?: boolean;
  /** Optional background polling in ms (e.g., 20000). Omit/undefined to disable. */
  pollMs?: number;
};

export function useWalletTokens(options?: Options) {
  const { publicKey, connected } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const refetchTokens = useCallback(async () => {
    if (!publicKey || !connected) return;
    try {
      setLoading(true);
      setError(null);

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
            mint: parsed.info.mint,
            amount: parseFloat(parsed.info.tokenAmount?.uiAmountString || '0'),
          };
        })
        .filter((t) => (t.amount ?? 0) > 0);

      // 3) Add native SOL
      const lamports = await connection.getBalance(publicKey);
      if (lamports > 0) {
        tokenListRaw.unshift({ mint: 'SOL', amount: lamports / 1e9, symbol: 'SOL' });
      }

      // 4) Enrich with symbol/logo (cached list + fallback metadata)
      const tokenMetadata = await fetchSolanaTokenList();
      const enriched = await Promise.all(
        tokenListRaw.map(async (token) => {
          if (token.mint === 'SOL') return token;
          const meta = tokenMetadata.find((m) => m.address === token.mint);
          if (meta) return { ...token, symbol: meta.symbol, logoURI: meta.logoURI };

          const fallback = await fetchTokenMetadata(token.mint);
          return { ...token, symbol: fallback?.symbol || token.mint.slice(0, 4) };
        })
      );

      setTokens(enriched);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch tokens');
      // Keep previous tokens for better UX
    } finally {
      setLoading(false);
    }
  }, [publicKey, connected]);

  // Trigger fetch on connect / wallet change
  useEffect(() => {
    if (publicKey && connected) {
      refetchTokens();
    } else {
      setTokens([]);
    }
  }, [publicKey, connected, refetchTokens]);

  // Auto-refetch on focus / accountChanged / optional polling
  useEffect(() => {
    if (!connected) return;
    const { autoRefetchOnFocus = true, autoRefetchOnAccountChange = true, pollMs } = options || {};

    const onVis = () => {
      if (document.visibilityState === 'visible') refetchTokens();
    };
    const onFocus = () => refetchTokens();

    const provider = (typeof window !== 'undefined' ? (window as any).solana : null);
    const onAcc = () => refetchTokens();

    if (autoRefetchOnFocus) {
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('focus', onFocus);
    }
    if (autoRefetchOnAccountChange) {
      provider?.on?.('accountChanged', onAcc);
    }

    let t: any;
    let stop = false;
    if (typeof pollMs === 'number' && pollMs > 0) {
      const loop = async () => {
        try { await refetchTokens(); } catch {}
        if (!stop) t = setTimeout(loop, pollMs);
      };
      loop();
    }

    return () => {
      if (autoRefetchOnFocus) {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('focus', onFocus);
      }
      if (autoRefetchOnAccountChange) {
        provider?.removeListener?.('accountChanged', onAcc);
      }
      if (t) { stop = true; clearTimeout(t); }
    };
  }, [connected, refetchTokens, options]);

  return { tokens, loading, error, refetchTokens };
}
