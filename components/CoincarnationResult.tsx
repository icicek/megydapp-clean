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
  const tweetText = `🚀 I just swapped my $${tokenFrom} for $MEGY. Coincarnator #${number} reporting in.\n\n🌐 We're uniting deadcoins to rescue billions.\n\n🔗 Join us → https://megydapp-clean.vercel.app`;
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
        className="block bg-black text-white rounded-lg shadow-lg p-6 hover:opacity-90 transition cursor-pointer"
      >
        <p className="text-xl font-extrabold text-blue-400 mb-2">SHARE</p>
        <p className="text-lg font-semibold text-purple-400 mb-1">YOUR</p>
        <p className="text-lg font-semibold text-yellow-400 mb-3">VICTORY</p>
        <p className="text-2xl font-bold text-pink-500">👻 Share on X</p>
      </a>

      <p className="text-lg mt-6 mb-4">
        You successfully swapped <strong>${tokenFrom}</strong> for $MEGY.
      </p>

      <div className="flex justify-center gap-4">
        <a
          href={tweetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-[140px] bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
        >
          🕊️ Share on X
        </a>

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
