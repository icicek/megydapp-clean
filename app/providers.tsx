// app/providers.tsx
'use client';
import React from 'react';
import WalletConnectionProvider from '@/components/WalletConnectionProvider';
import AutoConnectOnLoad from '@/components/wallet/AutoConnectOnLoad';

export default function Providers({ children }: { children: React.ReactNode }) {
  // AutoConnectOnLoad, wallet adapter context'ine ihtiyaç duyduğu için provider'ın içinde.
  return (
    <WalletConnectionProvider>
      <AutoConnectOnLoad />
      {children}
    </WalletConnectionProvider>
  );
}
