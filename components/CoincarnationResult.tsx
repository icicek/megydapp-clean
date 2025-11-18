// components/CoincarnationResult.tsx
'use client';

import React, { useState, useEffect, type JSX } from 'react';
import ShareCenter from '@/components/share/ShareCenter';
import { APP_URL } from '@/app/lib/origin';
import { useWallet } from '@solana/wallet-adapter-react';
import { buildPayload } from '@/components/share/intent';

interface Props {
  tokenFrom: string;              // e.g., "POPCAT"
  number: number;                 // Coincarnator #
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
  referral?: string;              // optional: ?r=
}

export default function CoincarnationResult({
  tokenFrom,
  number,
  onRecoincarnate,
  onGoToProfile,
  referral,
}: Props): JSX.Element {
  const { publicKey } = useWallet();
  const [shareOpen, setShareOpen] = useState(true); // ✅ Success sonrası direkt aç

  // Paylaşım URL'i (referral varsa ekle)
  const shareUrl = referral
    ? `${APP_URL}?r=${encodeURIComponent(referral)}`
    : APP_URL;

  const payload = buildPayload(
    'success',
    {
      url: shareUrl,
      token: tokenFrom,
    },
    {
      ref: referral ?? undefined,
      src: 'app',
    },
  );

  // Modal kapandığında bile success kutusu kalsın
  useEffect(() => {
    if (!shareOpen) {
      // burada ekstra bir şey yapmaya gerek yok; sadece state kontrolü
    }
  }, [shareOpen]);

  return (
    <div className="p-6 text-center">
      <h2 className="mb-4 text-2xl font-bold text-white">
        🎉 Success! Welcome, Coincarnator #{number}!
      </h2>

      <p className="mt-2 mb-5 text-lg text-gray-300">
        You successfully coincarnated{' '}
        <span className="font-bold text-purple-300">${tokenFrom}</span> for
        {' '}$MEGY.
      </p>

      {/* ShareCenter Modal */}
      <ShareCenter
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={payload}
        context="success"
        txId={undefined}
        walletBase58={publicKey?.toBase58() ?? null}
      />

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
    </div>
  );
}
