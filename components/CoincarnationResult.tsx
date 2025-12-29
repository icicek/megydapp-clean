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
  voteEligible?: boolean;
  tokenStatus?:
    | 'healthy'
    | 'walking_dead'
    | 'deadcoin'
    | 'redlist'
    | 'blacklist'
    | 'unknown'
    | null;
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
};

export default function CoincarnationResult({
  tokenFrom,
  number,
  txId,
  referral,
  voteEligible,
  tokenStatus, // şimdilik sadece debug / future use
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

      {voteEligible && (
        <div className="mb-6 mt-2 rounded-xl border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-50 text-left">
          <div className="mb-1 font-semibold">
            This token is under community review.
          </div>
          <p className="mb-2 text-xs opacity-80">
            You can help decide whether ${tokenFrom} should be classified as a
            real Deadcoin. Your vote also shapes how the Fair Future Fund
            protects future contributors.
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.open('/vote', '_blank', 'noopener,noreferrer');
              }
            }}
            className="inline-flex items-center rounded-lg border border-amber-400 px-3 py-1 text-xs font-semibold text-amber-50 transition hover:bg-amber-400/10"
          >
            🗳️ Go to Deadcoin Vote
          </button>
        </div>
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
