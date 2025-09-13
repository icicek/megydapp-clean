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

require('@solana/wallet-adapter-react-ui/styles.css');

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;

  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(network),
    [network]
  );

  // MUST match your live origin and be allowlisted in Reown/WC Cloud
  const appUrl = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
    return process.env.NEXT_PUBLIC_APP_URL ?? 'https://coincarnation.com';
  }, []);

  const wcProjectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
    process.env.WALLETCONNECT_PROJECT_ID;

  const wallets = useMemo((): WalletAdapter[] => {
    const list: WalletAdapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TrustWalletAdapter(),
      new LedgerWalletAdapter(),
    ];

    if (wcProjectId) {
      list.push(
        new WalletConnectWalletAdapter({
          network,
          options: {
            projectId: wcProjectId,
            relayUrl: 'wss://relay.walletconnect.com',
            metadata: {
              name: 'Coincarnation',
              description: 'Revive deadcoins → $MEGY',
              url: appUrl, // e.g. https://coincarnation.com
              icons: [`${appUrl}/og-image.png`], // absolute https URL
            },
          },
        })
      );
    }
    return list;
  }, [network, wcProjectId, appUrl]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
