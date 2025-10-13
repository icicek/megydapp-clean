// app/providers.tsx
'use client';
import React from 'react';
import WalletConnectionProvider from '@/components/WalletConnectionProvider';
import AutoConnectOnLoad from '@/components/wallet/AutoConnectOnLoad';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletConnectionProvider>
      <AutoConnectOnLoad />
      {children}
    </WalletConnectionProvider>
  );
}
