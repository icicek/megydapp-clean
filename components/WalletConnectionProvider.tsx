'use client';

import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import type { WalletAdapter } from '@solana/wallet-adapter-base';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

import '@solana/wallet-adapter-react-ui/styles.css';

/**
 * NOTE:
 * - Phantom/Solflare gibi cüzdanlar artık Wallet Standard ile otomatik keşfediliyor.
 * - Bu nedenle özel PhantomWalletAdapter / SolflareWalletAdapter EKLEME!
 * - Aksi halde "registered as a Standard Wallet" uyarıları ve seç/bağlan yarış durumları yaşanır.
 */

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const endpoint = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC ||
      clusterApiUrl('mainnet-beta')
    );
  }, []);

  const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';
  const APP_ORIGIN =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://coincarnation.com');

  // Only explicit adapter we add: WalletConnect (QR/deeplink için)
  const wallets = useMemo((): WalletAdapter[] => {
    const list: WalletAdapter[] = [];
    if (WC_PROJECT_ID) {
      list.push(
        new WalletConnectWalletAdapter({
          network: 'mainnet-beta' as any,
          options: {
            projectId: WC_PROJECT_ID,
            relayUrl: 'wss://relay.walletconnect.com',
            metadata: {
              name: 'Coincarnation DApp',
              description: 'Revive value, claim the Fair Future.',
              url: APP_ORIGIN,
              icons: [`${APP_ORIGIN}/icon.png`],
            },
          } as any,
        }) as any
      );
    }
    return list;
  }, [WC_PROJECT_ID, APP_ORIGIN]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false} // sayfa açılışında otomatik bağlanma yok; kullanıcı seçince bağlanır
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
