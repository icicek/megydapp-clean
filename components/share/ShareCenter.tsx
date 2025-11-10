'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SharePayload, Channel } from '@/components/share/intent';
import { detectInAppBrowser } from '@/components/share/browser';
import { openShareChannel } from '@/components/share/openShare';

// Minimal, clean toast
function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] rounded-lg border border-white/10 bg-zinc-900/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-md animate-fadeInOut">
      {message}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload;
  context: 'profile' | 'contribution' | 'leaderboard' | 'success';
  txId?: string;
  walletBase58?: string | null;
};

export default function ShareCenter({
  open,
  onOpenChange,
  payload,
  context,
  txId,
  walletBase58,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);

  // ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // client-only keyframes for toast
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('sharecenter-toast-style')) return;
    const style = document.createElement('style');
    style.id = 'sharecenter-toast-style';
    style.innerHTML = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(8px); }
        12% { opacity: 1; transform: translateY(0); }
        88% { opacity: 1; }
        100% { opacity: 0; transform: translateY(8px); }
      }
      .animate-fadeInOut { animation: fadeInOut 3.2s ease-in-out forwards; }
    `;
    document.head.appendChild(style);
  }, []);

  useMemo(() => detectInAppBrowser(), []); // geleceğe dönük, gerekirse kullanırız

  async function recordShare(channel: Channel) {
    if (!walletBase58) return;
    try {
      await fetch('/api/share/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletBase58, channel, context, txId: txId ?? null }),
      });
    } catch (e) {
      console.warn('[ShareCenter] record error', e);
    }
  }

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // X aktif, diğerleri toast
  const openChannel = useCallback(
    async (channel: Channel) => {
      if (channel === 'twitter') {
        await openShareChannel('twitter', payload);
        await recordShare('twitter');
        onOpenChange(false);
        return;
      }
      showToast(
        "Sharing for this app isn’t live yet — but you’ll still earn CorePoints when you copy and share manually!"
      );
    },
    [payload, walletBase58, context, txId, onOpenChange]
  );

  // Copy text
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload.text);
      await recordShare('copy');
      showToast('Post text copied — share manually to earn CorePoints!');
    } catch {
      showToast('Could not copy text.');
    }
  };

  if (!open) return null;

  const heading = 'Share';
  const sub = {
    profile: 'Invite your circle—your CorePoint grows with every ripple.',
    contribution: 'Your revival matters. Share it and inspire the next Coincarnator!',
    leaderboard: 'Flex your rank—one share could push you up the board.',
    success: 'Blast your revival—let the world see your $MEGY journey!',
  }[context];

  // helper: brand-dim class
  const dim = 'opacity-45 saturate-75 brightness-[0.8] text-white/70 hover:opacity-60 transition';

  const body = (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-[92%] max-w-[420px] rounded-2xl border border-white/10 bg-zinc-900 p-5 text-white shadow-[0_0_24px_rgba(255,0,255,0.15)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-transparent bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text">
              {heading}
            </h3>
            <button
              className="rounded-md px-2 py-1 text-sm hover:bg-white/5"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {sub && <p className="mb-4 text-sm text-zinc-300">{sub}</p>}

          <div className="mb-4 break-words rounded-xl border border-white/10 bg-zinc-800/70 p-3 text-xs text-zinc-200">
            {payload.text}
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-3 gap-3">
            {/* X — calm left-to-right gradient */}
            <button
              onClick={() => openChannel('twitter')}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/10 bg-gradient-to-r from-[#1DA1F2] via-[#8B5CF6] to-[#00E5FF] hover:brightness-110 transition whitespace-nowrap"
            >
              X
            </button>

            {/* Telegram (brand-dim) */}
            <button
              onClick={() => openChannel('telegram')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ring-1 ring-white/5 bg-[#26A5E4] ${dim}`}
            >
              Telegram
            </button>

            {/* WhatsApp (brand-dim) */}
            <button
              onClick={() => openChannel('whatsapp')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ring-1 ring-white/5 bg-[#25D366] ${dim}`}
            >
              Whatsapp
            </button>

            {/* Email (neutral-dim) */}
            <button
              onClick={() => openChannel('email')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ring-1 ring-white/5 bg-[#9CA3AF] ${dim}`}
            >
              Email
            </button>

            {/* Instagram (brand-dim gradient) */}
            <button
              onClick={() => openChannel('instagram')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ring-1 ring-white/5 bg-gradient-to-r from-[#F58529] via-[#D62976] to-[#4F5BD5] ${dim}`}
            >
              Instagram
            </button>

            {/* TikTok (brand-dim dual tone) */}
            <button
              onClick={() => openChannel('tiktok')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ring-1 ring-white/5 bg-[linear-gradient(90deg,#FE2C55_0%,#00F2EA_100%)] ${dim}`}
            >
              Tiktok
            </button>
          </div>

          <div className="mt-5">
            <button
              onClick={handleCopy}
              className="w-full rounded-lg px-3 py-3 text-sm font-semibold text-zinc-900 bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-300 shadow-sm ring-1 ring-white/10 hover:brightness-105 transition"
            >
              Copy text
            </button>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(body, document.body);
  }
  return body;
}
