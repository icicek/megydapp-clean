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

// Modal & buttons styles (gerekli)
import '@solana/wallet-adapter-react-ui/styles.css';

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  // RPC endpoint: env varsa onu kullan, yoksa mainnet-beta
  const endpoint = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC ||
      clusterApiUrl('mainnet-beta')
    );
  }, []);

  const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

  // Adapters tek seferlik oluşturulsun
  const wallets = useMemo((): WalletAdapter[] => {
    const list: WalletAdapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(), // parametresiz: sürümler arası TS uyumu
    ];

    if (WC_PROJECT_ID) {
      // Sürüm farkları nedeniyle tipler değişebiliyor → bilinçli cast
      const wc = new WalletConnectWalletAdapter({
        // bazı sürümlerde required olabiliyor; 'as any' ile uyumlu hale getiriyoruz
        network: 'mainnet-beta' as any,
        options: {
          projectId: WC_PROJECT_ID,
          relayUrl: 'wss://relay.walletconnect.com',
          metadata: {
            name: 'Coincarnation DApp',
            description: 'Revive value, claim the Fair Future.',
            url:
              typeof window !== 'undefined'
                ? window.location.origin
                : 'https://megydapp.vercel.app',
            icons: [
              typeof window !== 'undefined'
                ? `${window.location.origin}/icon.png`
                : 'https://megydapp.vercel.app/icon.png',
            ],
          },
        } as any,
      } as any) as unknown as WalletAdapter;

      list.push(wc);
    }

    return list;
  }, [WC_PROJECT_ID]);

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
