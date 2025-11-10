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

  useMemo(() => detectInAppBrowser(), []);

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

  // helper: “soft brand on black” base
  const softBase =
    'relative rounded-lg px-3 py-2 text-sm font-semibold text-white whitespace-nowrap ring-1 ring-white/10 bg-zinc-950';

  const body = (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-[92%] max-w-[420px] rounded-2xl border border-white/10 bg-zinc-900 p-5 text-white shadow-[0_0_24px_rgba(255,0,255,0.12)]">
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
            {/* X — dark→light blue gradient */}
            <button
              onClick={() => openChannel('twitter')}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white whitespace-nowrap ring-1 ring-blue-300/30 bg-gradient-to-r from-[#0A4BCB] to-[#58B0FF] hover:brightness-110 transition"
            >
              X
            </button>

            {/* Telegram — black base + soft brand wash */}
            <button
              onClick={() => openChannel('telegram')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(38,165,228,0.18)_0%,rgba(0,0,0,0.8)_40%)] hover:brightness-110`}
            >
              Telegram
            </button>

            {/* WhatsApp — black base + soft brand wash */}
            <button
              onClick={() => openChannel('whatsapp')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(37,211,102,0.18)_0%,rgba(0,0,0,0.8)_40%)] hover:brightness-110`}
            >
              Whatsapp
            </button>

            {/* Email — black base + soft neutral wash */}
            <button
              onClick={() => openChannel('email')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(156,163,175,0.18)_0%,rgba(0,0,0,0.8)_40%)] hover:brightness-110`}
            >
              Email
            </button>

            {/* Instagram — black base + soft multi wash */}
            <button
              onClick={() => openChannel('instagram')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(245,133,41,0.16)_0%,rgba(214,41,118,0.16)_35%,rgba(79,91,213,0.16)_70%,rgba(0,0,0,0.82)_100%)] hover:brightness-110`}
            >
              Instagram
            </button>

            {/* TikTok — black base + soft dual wash */}
            <button
              onClick={() => openChannel('tiktok')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(254,44,85,0.18)_0%,rgba(0,242,234,0.16)_35%,rgba(0,0,0,0.82)_100%)] hover:brightness-110`}
            >
              Tiktok
            </button>
          </div>

          <div className="mt-5">
            <button
              onClick={handleCopy}
              className="w-full rounded-lg px-3 py-3 text-sm font-semibold text-zinc-900 bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-300 ring-1 ring-white/10 hover:brightness-105 transition"
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
