'use client';
import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork, type WalletAdapter } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(network), [network]);

  const wallets = useMemo((): WalletAdapter[] => ([
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ]), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={(e,a)=>console.error('[WALLET ERROR]', a?.name, e)}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
export default WalletConnectionProvider;
