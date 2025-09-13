// components/WalletConnectionProvider.tsx
'use client';

import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork, type WalletAdapter } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  // TrustWalletAdapter,
  // LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
// import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(network), [network]);

  const wallets = useMemo((): WalletAdapter[] => {
    const list: WalletAdapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      // İstersen diğerlerini de açarız:
      // new TrustWalletAdapter(),
      // new LedgerWalletAdapter(),
    ];

    // 👉 WalletConnect’i QR için sonra ekleriz (şimdilik izole test):
    // const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || process.env.WALLETCONNECT_PROJECT_ID;
    // if (wcProjectId) {
    //   list.push(new WalletConnectWalletAdapter({
    //     network,
    //     options: {
    //       projectId: wcProjectId,
    //       relayUrl: 'wss://relay.walletconnect.com',
    //       metadata: {
    //         name: 'Coincarnation',
    //         description: 'Revive deadcoins → $MEGY',
    //         url: (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://coincarnation.com')),
    //         icons: [`${typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://coincarnation.com')}/og-image.png`],
    //       },
    //     },
    //   }));
    // }

    return list;
  }, [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={(err, adapter) => {
          console.error('[WALLET ERROR]', adapter?.name, err);
        }}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
