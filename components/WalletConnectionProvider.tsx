'use client';

import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Solana cüzdan adapter’ları (extension + mobile deep link desteği)
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
// (İsterseniz WalletConnect (Solana) da eklenebilir)

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  // RPC endpoint
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl('mainnet-beta'),
    []
  );

  // Adapter listesi — en azından Phantom/Solflare/Backpack’i kaydediyoruz.
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
      // new WalletConnectWalletAdapter({ network: 'mainnet-beta' }),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={(e, a) => console.error('[WALLET ERROR]', a?.name, e)}
      >
        {/* UI modal provider: useWalletModal() çalışsın */}
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
