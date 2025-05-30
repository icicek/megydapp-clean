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

🔗 Join us 👉 https://megydapp-clean.vercel.app`;

  const tweetLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  const finalImageUrl =
    imageUrl && imageUrl.includes('coincarnator')
      ? imageUrl
      : '/generated/og-image.png';

  return (
    <div className="text-center p-4">
      <h2 className="text-2xl font-bold mb-4">
        🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      <a href={tweetLink} target="_blank" rel="noopener noreferrer">
        <img
          src={finalImageUrl}
          alt="Share your victory"
          className="mx-auto w-64 h-64 rounded-lg shadow-lg mb-4 object-contain hover:opacity-90 transition"
        />
      </a>

      <p className="text-lg mb-4">
        You successfully swapped <strong>${tokenFrom}</strong> for $MEGY.
      </p>

      <div className="flex justify-center gap-4 mt-6">
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
