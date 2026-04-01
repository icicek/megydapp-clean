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

  amount?: number;
  usdValue?: number;
  explorerUrl?: string;

  onRecoincarnate: () => void;
  onGoToProfile: () => void;
};

export default function CoincarnationResult({
  tokenFrom,
  number,
  txId,
  referral,
  voteEligible,
  tokenStatus,
  amount,
  usdValue,
  explorerUrl,
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
      <h2 className="mb-4 text-2xl font-bold text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.7)]">
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

      <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-4 text-left">
        <div className="mb-2 text-sm font-semibold text-white">Transaction Summary</div>
        <div className="space-y-1 text-sm text-zinc-300">
          {typeof amount === 'number' && (
            <div>
              Amount:{' '}
              <span className="font-semibold text-white">
                {amount} ${tokenFrom}
              </span>
            </div>
          )}
          {typeof usdValue === 'number' && (
            <div>
              Estimated Value:{' '}
              <span className="font-semibold text-white">
                ${usdValue.toFixed(2)}
              </span>
            </div>
          )}
          <div>
            Tx ID:{' '}
            <span
              className="font-mono text-xs text-zinc-200 cursor-pointer hover:text-white"
              onClick={() => {
                navigator.clipboard.writeText(txId);
              }}
              title="Click to copy full transaction ID"
            >
              {txId.slice(0, 8)}...{txId.slice(-8)}
            </span>
          </div>
        </div>

        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center rounded-lg border border-cyan-400 px-3 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/10"
          >
            🔎 View on Explorer
          </a>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-100 text-left">
        <div className="font-semibold mb-1">What happens next?</div>
        <ul className="text-xs opacity-90 space-y-1">
          <li>• Your contribution is recorded in the Fair Future Fund</li>
          <li>• Your MEGY allocation will be finalized at snapshot</li>
          <li>• Share your Coincarnation to boost your CorePoint</li>
        </ul>
      </div>

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
