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
  /** Background polling in ms (e.g., 20000). Omit to disable. */
  pollMs?: number;
};

export function useWalletTokens(options?: Options) {
  const { publicKey, connected } = useWallet();
  const { connection: providerConnection } = useConnection(); // doğru kullanım
  const connection = providerConnection ?? fallbackConnection;

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);        // only for initial loads
  const [refreshing, setRefreshing] = useState(false);  // background updates
  const [error, setError] = useState<string | null>(null); // only for initial load errors

  const inflightRef = useRef(false);
  const reqIdRef = useRef(0);

  const mapParsed = (accs: any[]): { mint: string; amount: number }[] => {
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
        try {
          ui = Number(BigInt(raw)) / Math.pow(10, decimals);
        } catch {
          ui = Number(raw) / Math.pow(10, decimals);
        }
      }
      if (ui > 0) out.push({ mint, amount: ui });
    }
    return out;
  };

  const fetchFromOwnerParsed = async (owner: any, commitment: 'processed' | 'confirmed' | 'finalized') => {
    const [v1Res, v22Res] = await Promise.allSettled([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, commitment),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, commitment),
    ]);

    const allParsed: any[] = [
      ...(v1Res.status === 'fulfilled' ? v1Res.value.value : []),
      ...(v22Res.status === 'fulfilled' ? v22Res.value.value : []),
    ];
    return mapParsed(allParsed);
  };

  // Fallback: bazı RPC’lerde owner bazlı parsed çağrı boş döner → program bazlı parsed taraması
  const fetchFromProgramParsedFallback = async (owner: any, commitment: 'processed' | 'confirmed' | 'finalized') => {
    const ownerB58 = owner.toBase58();
    const filters = [{ memcmp: { offset: 32, bytes: ownerB58 } }]; // token account: owner @ offset 32

    const [v1Res, v22Res] = await Promise.allSettled([
      // Token v1 (165 byte data size), ama dataSize koymasak da olur
      connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters, commitment }),
      // Token-2022: data size değişken; sadece memcmp ile tarıyoruz
      connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, { filters, commitment }),
    ]);

    const allParsed: any[] = [
      ...(v1Res.status === 'fulfilled' ? v1Res.value : []),
      ...(v22Res.status === 'fulfilled' ? v22Res.value : []),
    ].map((x) => ({ account: x.account }));

    return mapParsed(allParsed);
  };

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
      const owner = publicKey;
      const commitment: 'confirmed' = 'confirmed';

      // 1) Önce normal yol
      let positive = await fetchFromOwnerParsed(owner, commitment);

      // 2) Boşsa fallback ile tara
      if (positive.length === 0) {
        positive = await fetchFromProgramParsedFallback(owner, commitment);
      }

      // 3) Aynı mint'leri birleştir
      const merged = new Map<string, number>();
      for (const t of positive) merged.set(t.mint, (merged.get(t.mint) ?? 0) + t.amount);

      // 4) Native SOL ekle (pseudo token)
      try {
        const lamports = await connection.getBalance(owner, commitment);
        if (lamports > 0) merged.set('SOL', (merged.get('SOL') ?? 0) + lamports / 1e9);
      } catch { /* ignore */ }

      // 5) Ham liste (büyükten küçüğe)
      const tokenListRaw: TokenInfo[] = Array.from(merged.entries())
        .map(([mint, amount]) => ({ mint, amount }))
        .sort((a, b) => b.amount - a.amount);

      // İlk anda “çıplak” listeyi göster (metadata bekletmesin)
      if (reqIdRef.current === myReq) {
        setTokens(
          tokenListRaw.map((t) =>
            t.mint === 'SOL'
              ? { ...t, symbol: 'SOL' }
              : { ...t, symbol: t.mint.slice(0, 4) }
          )
        );
        setHasLoadedOnce(true);
        if (!silent) setError(null);
      }

      // 6) Meta zenginleştirme (Jupiter/Registry) + tekil fallback
      const list = await fetchSolanaTokenList().catch(() => []);
      const metaMap = new Map(list.map((m: any) => [String(m.address).toLowerCase(), m]));

      const enriched = await Promise.all(
        tokenListRaw.map(async (token) => {
          if (token.mint === 'SOL') return { ...token, symbol: 'SOL' };

          const meta = metaMap.get(token.mint.toLowerCase());
          if (meta?.symbol || meta?.logoURI) {
            return {
              ...token,
              symbol: meta.symbol || token.mint.slice(0, 4),
              logoURI: meta.logoURI,
            };
          }

          try {
            const fb = await fetchTokenMetadata(token.mint);
            if (fb?.symbol || fb?.logoURI) {
              return {
                ...token,
                symbol: fb.symbol || token.mint.slice(0, 4),
                logoURI: fb.logoURI,
              };
            }
          } catch { /* ignore */ }

          return { ...token, symbol: token.mint.slice(0, 4) };
        })
      );

      if (reqIdRef.current !== myReq) return;
      setTokens(enriched);
    } catch (e: any) {
      if (!silent || !hasLoadedOnce) setError(e?.message || 'Failed to fetch tokens');
      // hata olsa bile state’leri bırakma
    } finally {
      if (reqIdRef.current === myReq) {
        setLoading(false);
        setRefreshing(false);
      }
      inflightRef.current = false;
    }
  }, [publicKey, connected, connection, hasLoadedOnce]);

  const refetchTokens = useCallback(async () => {
    await doFetch(false);
  }, [doFetch]);

  // Connect / cüzdan değişimi
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

  // Arka plan eşitleme
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
        try {
          if (document.visibilityState === 'visible') await doFetch(true);
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
