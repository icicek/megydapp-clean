'use client';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

export default function HomePage() {
  const { publicKey } = useWallet();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10">
      <h1 className="text-4xl font-bold mb-6">🚀 Coincarnation</h1>
      <WalletMultiButton />
      {publicKey && (
        <p className="mt-4 text-green-400">
          Connected: {publicKey.toBase58()}
        </p>
      )}
    </div>
  );
}
