// components/WalletConnectionProvider.tsx
'use client';

import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  // ---- RPC endpoint
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl('mainnet-beta'),
    []
  );

  // ---- Network enum
  const NETWORK = WalletAdapterNetwork.Mainnet;

  const wallets = useMemo(() => {
    const list = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: NETWORK }),
      new BackpackWalletAdapter(),
    ];

    const pid = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
    if (pid) {
      // Bazı sürümlerde WalletConnect adapter tipleri farklı; runtime parametreleri doğru.
      // TS'i güvenli şekilde susturmak için constructor'u any'e cast ediyoruz.
      const WCAdapter: any = WalletConnectWalletAdapter as any;
      list.push(
        new WCAdapter({
          network: NETWORK, // WalletAdapterNetwork enum
          options: {
            projectId: pid,
            relayUrl: 'wss://relay.walletconnect.com',
            metadata: {
              name: 'Coincarnation',
              description: 'Rescue your deadcoins. Coincarnate now!',
              url: process.env.NEXT_PUBLIC_APP_URL || 'https://coincarnation.com',
              icons: ['https://coincarnation.com/og-image.png'],
            },
          },
        })
      );
    }

    return list;
  }, [NETWORK]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={(e, a) => console.error('[WALLET ERROR]', a?.name, e)}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
