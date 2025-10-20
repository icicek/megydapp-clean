'use client';

import React, { ReactNode } from 'react';
import { ShareOnXAfterCoincarne } from '@/components/share/ShareOnX';

interface Props {
  tokenFrom: string;
  number: number;
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
  children?: ReactNode;
}

export default function CoincarnationResult({
  tokenFrom,
  number,
  onRecoincarnate,
  onGoToProfile,
  children,
}: Props) {
  return (
    <div className="text-center p-4">
      <h2 className="text-2xl font-bold mb-4">
        🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      {/* Merkezi Share on X butonu */}
      <ShareOnXAfterCoincarne
        symbol={tokenFrom}
        participantNumber={number}
        className="block max-w-sm mx-auto bg-black rounded-lg p-4 hover:opacity-90 transition border border-gray-700 text-center"
        onShared={async () => {
          try {
            await fetch('/api/share/record', { method: 'POST' });
          } catch {
            /* noop */
          }
        }}
      />

      {children && <div className="mt-4">{children}</div>}

      <p className="text-lg mt-6 mb-4">
        You successfully coincarnated <strong>${tokenFrom}</strong> for $MEGY.
      </p>

      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={onRecoincarnate}
          className="min-w-[140px] bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
        >
          ♻️ Recoincarnate
        </button>

        <button
          onClick={onGoToProfile}
          className="min-w-[140px] bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 transition"
        >
          👤 Go to Profile
        </button>
      </div>
    </div>
  );
}
