'use client';

import React, { useState, type JSX } from 'react';
import ShareCenter from '@/components/share/ShareCenter';
import { buildCoincarneText } from '@/utils/shareX';
import { APP_URL } from '@/app/lib/origin';

interface Props {
  tokenFrom: string;
  number: number;
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
}

export default function CoincarnationResult({
  tokenFrom,
  number,
  onRecoincarnate,
  onGoToProfile
}: Props): JSX.Element {

  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="text-center p-6">
      <h2 className="text-2xl font-bold mb-4 text-white">
        🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      {/* ✅ ShareCenter modalını açan yeni buton */}
      <button
        onClick={() => setShareOpen(true)}
        className="block max-w-sm mx-auto bg-gradient-to-r from-blue-600 to-blue-700 hover:scale-105 transition text-white font-semibold py-3 px-6 rounded-xl shadow-lg mb-6"
      >
        🚀 Share Your Revival!
      </button>

      <p className="text-lg mt-2 mb-4 text-gray-300">
        You successfully coincarnated <span className="font-bold text-purple-300">${tokenFrom}</span> for $MEGY.
      </p>

      <div className="flex justify-center gap-4 mt-6">
        <button
          onClick={onRecoincarnate}
          className="min-w-[140px] bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition font-semibold"
        >
          ♻️ Recoincarnate
        </button>

        <button
          onClick={onGoToProfile}
          className="min-w-[140px] bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 transition font-semibold"
        >
          👤 Go to Profile
        </button>
      </div>

      {/* ✅ ShareCenter Modal */}
      <ShareCenter
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={{
          url: APP_URL,
          text: buildCoincarneText({ symbol: tokenFrom, participantNumber: number }),
          hashtags: ['MEGY', 'Coincarnation', 'FairFutureFund'],
          via: 'Coincarnation',
          utm: 'utm_source=share&utm_medium=success&utm_campaign=coin'
        } as any}
        context="success"
        onAfterShare={async ({ channel, context }) => {
          try {
            await fetch('/api/share/record', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                channel,
                context,
                txId: null
              }),
            });
          } catch (e) {
            console.error('share record error', e);
          }
        }}
      />
    </div>
  );
}
