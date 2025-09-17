'use client';

import { useMemo } from 'react';
import { useChain } from '@/app/providers/ChainProvider';

// Hem default hem named export'u destekle:
import * as WalletTokensNS from '@/hooks/useWalletTokens';
// @ts-ignore: iki farklı export stilini tolere ediyoruz
const useWalletTokens: any =
  (WalletTokensNS as any).default ?? (WalletTokensNS as any).useWalletTokens;

export type ChainToken = {
  address: string;
  symbol?: string;
  decimals: number;
  amount: number;
  logoURI?: string;
};

type Result = {
  tokens: ChainToken[];
  loading: boolean;
  refetch: () => void;
};

export default function useChainTokens(): Result {
  const { chain } = useChain();

  const sol = useWalletTokens?.() ?? { tokens: [], loading: false, refetch: () => {} };

  const solanaTokens: ChainToken[] = useMemo(() => {
    if (!sol?.tokens) return [];
    return (sol.tokens as any[]).map((t: any) => ({
      address: t.address,
      symbol: t.symbol,
      decimals: t.decimals,
      amount: t.amount,
      logoURI: t.logoURI,
    }));
  }, [sol?.tokens]);

  if (chain === 'solana') {
    return {
      tokens: solanaTokens,
      loading: !!sol?.loading,
      refetch: sol?.refetch ?? (() => {}),
    };
  }

  // EVM (stub)
  return {
    tokens: [],
    loading: false,
    refetch: () => {},
  };
}
