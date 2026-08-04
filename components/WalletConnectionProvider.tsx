// components/WalletConnectionProvider.tsx
'use client';

import {
  useEffect,
  useMemo,
} from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import {
  WalletModalProvider,
} from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

import adapters from '@/components/wallet/adapters';

type WalletConnectionProviderProps = {
  children: React.ReactNode;
};

function getPublicSolanaRpcEndpoint(): string {
  const configuredEndpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();

  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  /*
   * The public Solana RPC is acceptable only during local
   * development. Production must always use the configured
   * browser RPC provider.
   */
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[WalletProvider] NEXT_PUBLIC_SOLANA_RPC_URL is missing. Falling back to the public Solana mainnet RPC.'
    );

    return clusterApiUrl('mainnet-beta');
  }

  throw new Error(
    'Missing env: NEXT_PUBLIC_SOLANA_RPC_URL'
  );
}

export default function WalletConnectionProvider({
  children,
}: WalletConnectionProviderProps) {
  const endpoint = useMemo(
    () => getPublicSolanaRpcEndpoint(),
    []
  );

  const wallets = useMemo(
    () => adapters,
    []
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const names = Array.isArray(wallets)
      ? wallets.map(
          (adapter) =>
            adapter?.name || 'wallet'
        )
      : [];

    console.info(
      '[WalletProvider mount]',
      names
    );

    console.info(
      '[WalletProvider endpoint]',
      endpoint
    );

    return () => {
      console.info(
        '[WalletProvider unmount]'
      );
    };
  }, [wallets, endpoint]);

  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{
        commitment: 'confirmed',
      }}
    >
      <WalletProvider
        wallets={wallets}
        autoConnect
        localStorageKey="coincarnation.wallet"
        onError={(error) => {
          console.error('[wallet-error]', {
            name: error?.name,
            message: error?.message,
          });
        }}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}