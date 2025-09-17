'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Chain } from '@/lib/chain/types';

type ChainContextState = {
  chain: Chain;
  setChain: (c: Chain) => void;
};

const ALLOWED: Chain[] = ['solana', 'ethereum', 'bsc', 'polygon', 'base'];

const ChainContext = createContext<ChainContextState>({
  chain: 'solana',
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setChain: () => {},
});

function sanitizeChain(value: unknown): Chain {
  if (typeof value === 'string' && ALLOWED.includes(value as Chain)) {
    return value as Chain;
  }
  return 'solana';
}

export function useChain() {
  return useContext(ChainContext);
}

export function ChainProvider({
  children,
  defaultChain = 'solana',
}: {
  children: React.ReactNode;
  defaultChain?: Chain;
}) {
  const [chain, setChainState] = useState<Chain>(() => sanitizeChain(defaultChain));

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('cc_chain') : null;
      if (stored) setChainState(sanitizeChain(stored));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('cc_chain', chain);
      }
    } catch {}
  }, [chain]);

  const setChain = useCallback((c: Chain) => {
    setChainState(sanitizeChain(c));
  }, []);

  const value = useMemo<ChainContextState>(() => ({ chain, setChain }), [chain, setChain]);

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}
