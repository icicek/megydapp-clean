'use client';

import { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import CoincarneModal from '@/components/CoincarneModal'; // Modal içerikleri burada olacak
import Image from 'next/image';

export default function HomePage() {
  const { publicKey } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  const handleCoincarneClick = () => {
    if (!publicKey) {
      alert('Please connect your wallet first.');
      return;
    }
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl md:text-5xl font-bold mb-10 text-center">
        🧟‍♂️ Welcome to <span className="text-purple-400">Coincarnation</span>
      </h1>

      <div className="flex gap-4 mb-6 w-full max-w-xl justify-center">
        <div className="flex-1 border border-gray-700 rounded-2xl p-4 text-center">
          <p className="text-sm text-gray-400 mb-1">You Give</p>
          <p className="text-xl font-semibold">Walking Deadcoins</p>
          <p className="text-sm text-gray-500">(Memecoins, Shitcoins...)</p>
        </div>

        <button
          className="bg-purple-600 hover:bg-purple-700 transition-all p-3 rounded-full text-xl shadow-lg"
          onClick={handleCoincarneClick}
        >
          <Image src="/swap-icon.png" alt="↔️" width={28} height={28} />
        </button>

        <div className="flex-1 border border-gray-700 rounded-2xl p-4 text-center">
          <p className="text-sm text-gray-400 mb-1">You Receive</p>
          <p className="text-xl font-semibold text-green-400">$MEGY</p>
          <p className="text-sm text-gray-500">(World Currency)</p>
        </div>
      </div>

      <WalletMultiButton className="mb-4" />
      {publicKey && (
        <p className="text-green-400 text-sm">
          Connected: {publicKey.toBase58()}
        </p>
      )}

      {/* Modal */}
      {modalOpen && (
        <CoincarneModal onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
