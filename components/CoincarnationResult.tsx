'use client';

import React from 'react';

interface Props {
  tokenFrom: string;
  number: number;
  imageUrl: string;
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
}

export default function CoincarnationResult({
  tokenFrom,
  number,
  imageUrl,
  onRecoincarnate,
  onGoToProfile,
}: Props) {
  const tweetText = `🚀 I just swapped my $${tokenFrom} for $MEGY. Coincarnator #${number} reporting in.\n\n🌐 We're uniting deadcoins to rescue billions.\n\n🔗 Join us 👉 https://megydapp-clean.vercel.app`;
  const tweetLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div className="text-center p-4">
      <h2 className="text-2xl font-bold mb-4">
        🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      <a
        href={tweetLink}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-sm mx-auto bg-black rounded-lg p-4 hover:opacity-90 transition border border-gray-700"
      >
        <div className="text-blue-400 font-bold text-xl">SHARE</div>
        <div className="text-purple-400 font-semibold">YOUR VICTORY</div>
        <div className="text-yellow-400 font-semibold">MILLIONS ARE WAITING</div>
        <div className="mt-2 text-pink-500 font-bold bg-white/10 inline-block px-4 py-2 rounded mt-4">
          🐦 SHARE ON X
        </div>
      </a>

      <p className="text-lg mt-6 mb-4">
        You successfully swapped <strong>${tokenFrom}</strong> for $MEGY.
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
