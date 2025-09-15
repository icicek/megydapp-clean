'use client';

import { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  // Özel RPC varsa onu kullan, yoksa mainnet-beta
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl('mainnet-beta'),
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* ÖNEMLİ: wallets boş dizi → Standard cüzdanlar (MetaMask dâhil) otomatik */}
      <WalletProvider
        wallets={[]}
        autoConnect={false}
        onError={(e, a) => console.error('[WALLET ERROR]', a?.name, e)}
      >
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
