'use client';

import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import type { WalletAdapter } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  WalletConnectWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

import '@solana/wallet-adapter-react-ui/styles.css';

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const endpoint = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC ||
      clusterApiUrl('mainnet-beta')
    );
  }, []);

  const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

  // ✅ Production/staging için doğru origin’i seç
  const APP_ORIGIN =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://coincarnation.com');

  const wallets = useMemo((): WalletAdapter[] => {
    const list: WalletAdapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ];

    if (WC_PROJECT_ID) {
      const wc = new WalletConnectWalletAdapter({
        network: 'mainnet-beta' as any,
        options: {
          projectId: WC_PROJECT_ID,
          relayUrl: 'wss://relay.walletconnect.com',
          metadata: {
            name: 'Coincarnation DApp',
            description: 'Revive value, claim the Fair Future.',
            url: APP_ORIGIN,                         // 👈 burada artık coincarnation.com
            icons: [`${APP_ORIGIN}/icon.png`],       // 👈 ve ikon yolu da bu origin’den
          },
        } as any,
      } as any) as unknown as WalletAdapter;

      list.push(wc);
    }

    return list;
  }, [WC_PROJECT_ID, APP_ORIGIN]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={(e) => {
          console.error('[WALLET ERROR]', e?.name, e?.message, e);
        }}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
