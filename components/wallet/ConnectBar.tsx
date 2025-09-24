// components/wallet/ConnectBar.tsx
'use client';

import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useChain } from '@/app/providers/ChainProvider';

/**
 * Solana-only Connect Bar:
 * - Sadece Solana ağı aktifken cüzdan düğmesini gösterir.
 * - WalletMultiButton doğrudan Phantom/Solflare/Backpack modalını açar.
 * - EVM akışı devre dışı olduğu için ağ chip'leri yok.
 */
export default function ConnectBar() {
  const { chain } = useChain();

  return (
    <div className="flex items-center gap-2">
      {chain === 'solana' && (
        <WalletMultiButton
          className="!bg-indigo-600 hover:!bg-indigo-700 !text-white !rounded-lg !px-4 !py-2 !h-10"
        />
      )}
    </div>
  );
}
