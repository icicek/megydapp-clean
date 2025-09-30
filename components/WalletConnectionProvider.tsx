'use client';
import { useEffect, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import adapters from '@/components/wallet/adapters';

export default function WalletConnectionProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || clusterApiUrl('mainnet-beta'),
    []
  );
  useEffect(() => {
    console.info('[WalletProvider mount]', adapters.map(a => a.name));
    return () => console.info('[WalletProvider UNMOUNT]');
  }, []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={adapters} autoConnect={false} onError={(e)=>console.error('[wallet]', e)}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
