'use client';

import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function ConnectInline({
  message = '🔌 Please connect your wallet to view your claim profile.',
}: { message?: string }) {
  const { connected } = useWallet();

  if (connected) return null;

  return (
    <div className="w-full max-w-xl mx-auto bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
      <p className="text-sm text-gray-300 mb-3">{message}</p>
      {/* WalletMultiButton modalı açar → anasayfaya dönmek gerekmez */}
      <div className="flex justify-center">
        <WalletMultiButton />
      </div>
    </div>
  );
}
