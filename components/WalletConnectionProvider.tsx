'use client';

import { useEffect, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import adapters from '@/components/wallet/adapters';

export default function WalletConnectionProvider({ children }: { children: React.ReactNode }) {
  // RPC endpoint: sizin ortam değişkenlerinizle uyumlu geniş fallback
  const endpoint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
      process.env.SOLANA_RPC?.trim() ||
      process.env.ALCHEMY_SOLANA_RPC?.trim() ||
      clusterApiUrl('mainnet-beta'),
    []
  );

  // Wallet adapter'ları tek kez sabitle (yeniden yaratma → disconnect tetikler)
  const wallets = useMemo(() => adapters, []);

  useEffect(() => {
    // debug log (isteğe bağlı)
    try {
      // adapters hem class hem instance olabilir; name varsa göster
      const names = Array.isArray(wallets) ? wallets.map((a: any) => a?.name || 'wallet') : [];
      console.info('[WalletProvider mount]', names);
    } catch {}
    return () => console.info('[WalletProvider UNMOUNT]');
  }, [wallets]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={true}                   // 🔑 sayfa yenile/route değişiminde geri bağlanır
        localStorageKey="coincarnation.wallet" // 🔑 seçili cüzdan kalıcı
        onError={(e) => console.error('[wallet]', e)}
      >
        {/* Modal & WalletMultiButton için gerekli */}
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
