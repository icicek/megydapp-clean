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
  const tweetText = `🚀 I just swapped my $${tokenFrom} for $MEGY. Coincarnator #${number} reporting in.

🌐 We're uniting deadcoins to rescue billions.

🔗 Join us 👉 https://megydapp.vercel.app`;

  const tweetLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div className="text-center p-4">
      <h2 className="text-2xl font-bold mb-4">🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      <img
        src={imageUrl}
        alt="Coincarnation Visual"
        className="mx-auto w-64 h-64 rounded-lg shadow-lg mb-4 object-contain"
      />

      <p className="text-lg mb-4">
        You successfully swapped <strong>${tokenFrom}</strong> for $MEGY.
      </p>

      <div className="flex flex-wrap justify-center gap-3 mt-6">
        <a
          href={tweetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-[140px] bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
        >
          🗞 Share on X
        </a>
        <button
          onClick={onRecoincarnate}
          className="min-w-[140px] bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
        >
          ♲️ Recoincarnate
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