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

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;

  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(network),
    [network]
  );

  const appUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://coincarnation.com');

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

    // İstersen geçici olarak WC'yi yorum satırına alıp diğer cüzdanları izole test edebilirsin.
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
              url: appUrl, // MUST match the real origin
              icons: [`${appUrl}/og-image.png`],
            },
          },
        })
      );
    }
    return list;
  }, [network, wcProjectId, appUrl]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* stale/broken session’a yapışmayı engellemek için şimdilik kapalı */}
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={(err, adapter) => {
          // Hata olduğunda modal kapanabilir; burada sebebi net göreceğiz
          console.error('[WALLET ERROR]', adapter?.name, err);
          // İstersen alert de at:
          // alert(`${adapter?.name || 'Wallet'} error: ${err?.message || err}`);
        }}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
