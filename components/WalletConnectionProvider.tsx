'use client';

import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork, type WalletAdapter } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(network), [network]);

  const appUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://coincarnation.com');

  const wcProjectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
    process.env.WALLETCONNECT_PROJECT_ID;

  // Standart uzantılar (Phantom, Solflare, Backpack...) otomatik algılanır → wallets=[]
  // Sadece WalletConnect'i (QR/mobil) eklemek istiyorsan aşağıdaki bloğu bırak.
  const wallets = useMemo((): WalletAdapter[] => {
    const list: WalletAdapter[] = [];
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
              url: appUrl,
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
