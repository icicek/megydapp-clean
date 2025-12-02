// components/CoincarnationResult.tsx
'use client';

import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { APP_URL } from '@/app/lib/origin';
import { buildPayload, buildTwitterIntent } from '@/components/share/intent';

type Props = {
  tokenFrom: string;
  number: number;
  txId: string;
  referral?: string;
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
};

export default function CoincarnationResult({
  tokenFrom,
  number,
  txId,
  referral,
  onRecoincarnate,
  onGoToProfile,
}: Props) {
  const { publicKey } = useWallet();

  const handleShareOnX = async () => {
    const wallet = publicKey?.toBase58() ?? null;

    // 1) Merkezi share payload (intent.ts)
    const payload = buildPayload(
      'success',
      {
        url: APP_URL,        // canonical base
        token: tokenFrom,    // örn. "QUANT"
      },
      {
        ref: referral || undefined, // referral varsa shortUrl: /share/success/[ref]?src=app
        src: 'app',
        // ctx: 'success' // gerek yok, default ctx zaten 'success'
      }
    );

    // 2) CorePoint / share event (eskisi gibi)
    try {
      const body: any = {
        channel: 'twitter',
        context: 'success',
        txId,
      };
      if (wallet) {
        body.wallet = wallet;
      }
      if (referral) {
        body.anchor = referral;
      }

      await fetch('/api/share/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      });
    } catch (e) {
      console.warn('⚠️ share/record failed on success screen:', e);
    }

    // 3) X intent URL (metin + link + #Coincarnation #Web3 via @levershare)
    const xUrl = buildTwitterIntent(payload);

    if (typeof window !== 'undefined') {
      window.open(xUrl, '_blank', 'noopener,noreferrer');
    }
  };

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

      {/* 🔹 Success için merkezi share sistemi (intent.ts + buildTwitterIntent) */}
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
