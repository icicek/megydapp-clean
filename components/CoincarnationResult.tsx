'use client';

import React from 'react';
import { buildPayload } from '@/components/share/intent';
import type { SharePayload } from '@/components/share/intent';

type Props = {
  tokenFrom: string;              // e.g. "POPCAT"
  number: number;                 // Coincarnator #
  txId: string;                   // Coincarnation tx id (signature / hash)
  referral?: string;
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
  onShare: (payload: SharePayload, txId?: string) => void;
};

export default function CoincarnationResult({
  tokenFrom,
  number,
  txId,
  referral,
  onRecoincarnate,
  onGoToProfile,
  onShare,
}: Props) {
  // ---- Share payload (success context) ----
  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://coincarnation.com';

  const url = referral ? `${baseUrl}?r=${referral}` : baseUrl;

  const dataForShare = {
    url,
    tokenFrom,
    number,
    txId,
  };

  const sharePayload: SharePayload = buildPayload(
    'success',
    dataForShare as any, // ⬅️ TS'i susturuyoruz; runtime'da bu alanlar kullanılıyor
    {
      ref: referral ?? undefined,
      src: 'app',
    },
  );

  return (
    <div className="p-6 text-center">
      <h2 className="mb-4 text-2xl font-bold text-white">
        🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      <p className="mt-2 mb-4 text-lg text-gray-300">
        You successfully coincarnated{' '}
        <span className="font-bold text-purple-300">${tokenFrom}</span> for $MEGY.
      </p>

      {referral && (
        <p className="mb-6 text-xs text-gray-400">
          Your referral code:{' '}
          <span className="font-mono text-purple-300">{referral}</span>
        </p>
      )}

      {/* Share on X → ShareCenter + CorePoint */}
      <button
        type="button"
        onClick={() => onShare(sharePayload, txId)}
        className="mb-6 block w-full max-w-xs mx-auto rounded-xl
                   bg-gradient-to-r from-sky-500 to-blue-600
                   px-6 py-3 font-semibold text-white shadow-lg
                   transition hover:scale-105"
      >
        🐦 Share on X
      </button>

      <div className="mt-4 flex justify-center gap-4">
        <button
          type="button"
          onClick={onRecoincarnate}
          className="min-w-[140px] rounded bg-purple-600 px-4 py-2
                     font-semibold text-white transition hover:bg-purple-700"
        >
          ♻️ Recoincarnate
        </button>

        <button
          type="button"
          onClick={onGoToProfile}
          className="min-w-[140px] rounded bg-gray-700 px-4 py-2
                     font-semibold text-white transition hover:bg-gray-800"
        >
          👤 Go to Profile
        </button>
      </div>
    </div>
  );
}
