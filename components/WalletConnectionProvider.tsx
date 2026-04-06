//components/WalletConnectionProvider.tsx
'use client';

import { useEffect, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import adapters from '@/components/wallet/adapters';

export default function WalletConnectionProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
      clusterApiUrl('mainnet-beta'),
    []
  );

  const wallets = useMemo(() => adapters, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    try {
      const names = Array.isArray(wallets)
        ? wallets.map((a: any) => a?.name || 'wallet')
        : [];
      console.info('[WalletProvider mount]', names);
      console.info('[WalletProvider endpoint]', endpoint);
    } catch {}

    return () => {
      console.info('[WalletProvider UNMOUNT]');
    };
  }, [wallets, endpoint]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={true}
        localStorageKey="coincarnation.wallet"
        onError={(e) => {
          console.error('[wallet-error]', {
            name: e?.name,
            message: e?.message,
          });
        }}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}