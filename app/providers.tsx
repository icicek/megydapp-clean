'use client';

import WalletConnectionProvider from '@/components/WalletConnectionProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  // Burada SADECE WalletConnectionProvider olsun. Başka WalletProvider yok.
  return <WalletConnectionProvider>{children}</WalletConnectionProvider>;
}
