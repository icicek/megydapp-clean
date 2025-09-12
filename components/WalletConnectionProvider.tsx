'use client';

import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork, type WalletAdapter } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TrustWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { absoluteUrl } from '@/app/lib/origin';

require('@solana/wallet-adapter-react-ui/styles.css');

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;

  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(network),
    [network]
  );

  const wcProjectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
    process.env.WALLETCONNECT_PROJECT_ID;

  const wallets = useMemo(() => {
    const list: WalletAdapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TrustWalletAdapter(),
      new LedgerWalletAdapter(),
    ];

    if (typeof wcProjectId === 'string' && wcProjectId.length > 0) {
      list.push(
        new WalletConnectWalletAdapter({
          network,
          options: {
            relayUrl: 'wss://relay.walletconnect.com',
            projectId: wcProjectId,
            metadata: {
              name: 'Coincarnation',
              description: 'Rescue your deadcoins. Coincarnate now!',
              url: process.env.NEXT_PUBLIC_APP_URL || 'https://example.com',
              icons: [absoluteUrl('/og-image.png')],
            },
          },
        })
      );
    }

    return list;
  }, [network, wcProjectId]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
