// components/CoincarnationResult.tsx
'use client';

import React, { useState, type JSX } from 'react';
import ShareCenter from '@/components/share/ShareCenter';
import { APP_URL } from '@/app/lib/origin';
import { useWallet } from '@solana/wallet-adapter-react';
import { buildPayload } from '@/components/share/intent'; // 👈 yeni helper

interface Props {
  tokenFrom: string;
  number: number;                 // Coincarnator #
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
}

export default function CoincarnationResult({
  tokenFrom,
  number,
  onRecoincarnate,
  onGoToProfile,
}: Props): JSX.Element {
  const { publicKey } = useWallet();
  const [shareOpen, setShareOpen] = useState(false);

  // (İstersen URL'ye referral/utm ekleyebilirsin — buildPayload zaten utm ekliyor)
  const payload = buildPayload('success', {
    url: APP_URL,          // örn: `${APP_URL}?r=${referral}`
    token: tokenFrom,
    rank: number,
  });

  return (
    <div className="p-6 text-center">
      <h2 className="mb-4 text-2xl font-bold text-white">
        🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      {/* ShareCenter modalını açan buton */}
      <button
        type="button"
        onClick={() => setShareOpen(true)}
        className="mb-6 block max-w-sm rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 font-semibold text-white shadow-lg transition hover:scale-105"
      >
        🚀 Share Your Revival!
      </button>

      <p className="mt-2 mb-4 text-lg text-gray-300">
        You successfully coincarnated <span className="font-bold text-purple-300">${tokenFrom}</span> for $MEGY.
      </p>

      <div className="mt-6 flex justify-center gap-4">
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

      {/* ShareCenter Modal */}
      <ShareCenter
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={payload}                 // 👈 artık helper'dan geliyor
        context="success"
        txId={undefined}
        walletBase58={publicKey?.toBase58() ?? null}
      />
    </div>
  );
}
