// app/providers.tsx
'use client';
import React from 'react';
import WalletConnectionProvider from '@/components/WalletConnectionProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  // İleride ChainProvider / WalletHubProvider eklemek istersen buraya sararsın.
  return <WalletConnectionProvider>{children}</WalletConnectionProvider>;
}
