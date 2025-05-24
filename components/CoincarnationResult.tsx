'use client';

import React from 'react';

interface Props {
  tokenFrom: string;
  number: number;
  imageUrl: string;
}

export default function CoincarnationResult({ tokenFrom, number, imageUrl }: Props) {
  const tweetText = `🚀 I just swapped my $${tokenFrom} for $MEGY. Coincarnator #${number} reporting in.\n\n🌐 We're uniting deadcoins to rescue billions.\n\n🔗 Join us 👉 https://megydapp.vercel.app`;

  const tweetLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div className="text-center p-4">
      <h2 className="text-2xl font-bold mb-4">🎉 Success! Welcome, Coincarnator #{number}!</h2>

      <img
        src={imageUrl}
        alt="Coincarnation Visual"
        className="mx-auto w-64 h-64 rounded-lg shadow-lg mb-4 object-contain"
      />

      <p className="text-lg mb-4">You successfully swapped <strong>${tokenFrom}</strong> for $MEGY.</p>

      <a
        href={tweetLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition"
      >
        🐦 Share on X
      </a>
    </div>
  );
}
