// components/CoincarnationResult.tsx
'use client';

import React, { type JSX } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { APP_URL } from '@/app/lib/origin';

interface Props {
  tokenFrom: string;              // e.g. "POPCAT"
  number: number;                 // Coincarnator #
  imageUrl: string;               // Şimdilik sadece prop olarak duruyor, istersen ileride görsel gösteririz
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
}

export default function CoincarnationResult({
  tokenFrom,
  number,
  imageUrl,
  onRecoincarnate,
  onGoToProfile,
}: Props): JSX.Element {
  const { publicKey } = useWallet();

  const handleShareOnX = async () => {
    const wallet = publicKey?.toBase58() ?? null;

    // Paylaşım linki (şimdilik referral'sız, direkt site)
    const url = APP_URL;
    const text = `I just coincarnated $${tokenFrom} into $MEGY on Coincarnation. Join the revival: ${url}`;

    // 1) CorePoint kaydı (fire-and-forget)
    if (wallet) {
      try {
        await fetch('/api/share/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet,
            channel: 'twitter',
            context: 'success',   // success ekranındaki paylaşım
          }),
        });
      } catch (e) {
        console.warn('⚠️ share/record failed:', e);
      }
    }

    // 2) X paylaşım penceresini aç
    const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    if (typeof window !== 'undefined') {
      window.open(xUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="p-6 text-center">
      <h2 className="mb-4 text-2xl font-bold text-white">
        🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      <p className="mt-2 mb-6 text-lg text-gray-300">
        You successfully coincarnated{' '}
        <span className="font-bold text-purple-300">${tokenFrom}</span> for $MEGY.
      </p>

      {/* Sadece X’te paylaşım butonu */}
      <button
        type="button"
        onClick={handleShareOnX}
        className="mb-6 block w-full max-w-xs mx-auto rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:scale-105"
      >
        🐦 Share on X
      </button>

      <div className="mt-4 flex justify-center gap-4">
        <button
          type="button"
          onClick={onRecoincarnate}
          className="min-w-[140px] rounded bg-purple-600 px-4 py-2 font-semibold text-white transition hover:bg-purple-700"
        >
          ♻️ Recoincarnate
        </button>

        <button
          type="button"
          onClick={onGoToProfile}
          className="min-w-[140px] rounded bg-gray-700 px-4 py-2 font-semibold text-white transition hover:bg-gray-800"
        >
          👤 Go to Profile
        </button>
      </div>
    </div>
  );
}
