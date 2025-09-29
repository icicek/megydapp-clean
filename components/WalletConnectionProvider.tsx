'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import adapters from '@/components/wallet/adapters';

export default function WalletConnectionProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || clusterApiUrl('mainnet-beta'),
    []
  );

  // remount tespiti (konsolda gör)
  const mounts = useRef(0);
  useEffect(() => {
    mounts.current += 1;
    console.info('[WalletProvider mount x' + mounts.current + ']', adapters.map(a => a.name));
    return () => console.info('[WalletProvider UNMOUNT]');
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={adapters} autoConnect={false} onError={(e) => console.error('[wallet-adapter]', e)}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
