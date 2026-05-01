// components/CoincarnationResult.tsx
'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { APP_URL } from '@/app/lib/origin';
import type { SharePayload } from '@/components/share/intent';
import { buildPayload } from '@/components/share/intent';
import ShareCenter from '@/components/share/ShareCenter';

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
  const [copied, setCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const handleShareOnX = async () => {
    if (shareBusy) return;
    setShareBusy(true);
  
    try {
      const payload = buildPayload(
        'success',
        {
          url: APP_URL,
          token: tokenFrom,
        },
        {
          ref: referral || undefined,
          src: 'app',
        }
      );
  
      setSharePayload(payload);
      setShareOpen(true);
    } finally {
      window.setTimeout(() => setShareBusy(false), 500);
    }
  };

  return (
    <>
      <div className="px-3 py-4 text-center sm:px-5 sm:py-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
          Coincarnation Complete
        </div>
  
        <h2 className="text-[24px] font-black leading-tight tracking-tight text-white drop-shadow-[0_0_16px_rgba(168,85,247,0.35)] sm:text-[28px]">
          Coincarnator #{number}
        </h2>
  
        <p className="mt-2 text-xs leading-5 text-gray-300 sm:text-sm">
          You successfully Coincarnated{' '}
          <span className="font-bold text-fuchsia-300">${tokenFrom}</span>
          {' '}into the Fair Future Fund.
        </p>
  
        {referral && (
          <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/[0.07] px-3 py-1 text-[10px] text-fuchsia-200">
            <span>Referral:</span>
            <span className="truncate font-mono font-semibold">{referral}</span>
          </div>
        )}
  
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Transaction Intelligence
          </div>
  
          <div className="space-y-2 text-xs text-zinc-300 sm:text-sm">
            {typeof amount === 'number' && (
              <div>
                Amount:{' '}
                <span className="font-semibold text-white">
                  {amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenFrom}
                </span>
              </div>
            )}
  
            {typeof usdValue === 'number' && usdValue > 0 && (
              <div>
                Estimated Value:{' '}
                <span className="font-semibold text-white">
                  ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
  
            <div>
              Coincarnator:{' '}
              <span className="font-semibold text-white">#{number}</span>
            </div>
  
            <div className="min-w-0">
              Tx ID:{' '}
              <button
                type="button"
                className="font-mono text-[11px] text-zinc-200 hover:text-white"
                onClick={async () => {
                  try {
                    if (navigator?.clipboard?.writeText) {
                      await navigator.clipboard.writeText(txId);
                    } else {
                      const ta = document.createElement('textarea');
                      ta.value = txId;
                      ta.setAttribute('readonly', '');
                      ta.style.position = 'absolute';
                      ta.style.left = '-9999px';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                    }
  
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                  } catch (e) {
                    console.warn('Clipboard copy failed:', e);
                  }
                }}
                title="Click to copy full transaction ID"
              >
                {txId.slice(0, 8)}...{txId.slice(-8)}
              </button>
              {copied && (
                <span className="ml-2 text-[11px] text-emerald-300">Copied</span>
              )}
            </div>
          </div>
  
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/[0.10]"
            >
              🔎 View on Explorer
            </a>
          )}
        </div>
  
        {voteEligible && tokenStatus === 'walking_dead' && (
          <div className="mt-4 rounded-[22px] border border-amber-400/20 bg-amber-500/[0.07] px-4 py-3 text-left text-xs text-amber-100">
            <div className="mb-1 font-semibold">
              This token is under community review.
            </div>
  
            <p className="mb-3 opacity-85">
              You can help decide whether ${tokenFrom} should officially become a Deadcoin.
            </p>
  
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.open('/vote', '_blank', 'noopener,noreferrer');
                }
              }}
              className="inline-flex items-center rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/[0.10]"
            >
              🗳️ Go to Deadcoin Vote
            </button>
          </div>
        )}
  
        <button
          type="button"
          onClick={handleShareOnX}
          disabled={shareBusy}
          className="mt-5 flex w-full items-center justify-center rounded-[22px] bg-[linear-gradient(90deg,#22d3ee,#3b82f6,#8b5cf6)] px-4 py-3 text-center text-sm font-black leading-tight tracking-wide text-white shadow-[0_12px_28px_rgba(59,130,246,0.28)] transition-all duration-200 hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
        >
          {shareBusy ? 'Preparing Share...' : '🚀 Share Coincarnation'}
        </button>
  
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onRecoincarnate}
            className="min-w-0 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.07] px-3 py-3 text-sm font-semibold leading-tight text-fuchsia-100 transition-all duration-200 hover:bg-fuchsia-500/[0.12] active:scale-95 sm:text-base"
          >
            ♻️ Recoincarnate
          </button>
  
          <button
            type="button"
            onClick={onGoToProfile}
            className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-sm font-semibold leading-tight text-gray-200 transition-all duration-200 hover:bg-white/[0.06] active:scale-95 sm:text-base"
          >
            👤 Go Profile
          </button>
        </div>
  
        <div className="mt-4 rounded-[22px] border border-emerald-400/15 bg-emerald-500/[0.05] px-4 py-4 text-left text-xs text-emerald-100">
          <div className="mb-2 text-sm font-semibold text-emerald-200">
            What happens now?
          </div>
  
          <ul className="space-y-1 leading-5 opacity-90">
            <li>• Your contribution is recorded inside the Fair Future Fund.</li>
            <li>• Your $MEGY allocation finalizes at snapshot.</li>
            <li>• Your Coincarnator identity is now active.</li>
            <li>• Sharing increases viral visibility and CorePoint impact.</li>
          </ul>
        </div>
      </div>
  
      <ShareCenter
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={sharePayload}
        context="success"
        txId={txId}
        walletBase58={publicKey?.toBase58() ?? null}
        anchor={referral ? `success:${referral}:${txId}` : `success:${txId}`}
      />
    </>
  );
}
