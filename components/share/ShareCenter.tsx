'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SharePayload, Channel } from '@/components/share/intent';
import { detectInAppBrowser } from '@/components/share/browser';
import { openShareChannel } from '@/components/share/openShare';

// Minimal toast
function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[20000] rounded-lg border border-white/10 bg-zinc-900/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-md animate-fadeInOut">
      {message}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload; // dışarıda context'e göre üretilir
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

  // ESC ile kapatma
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Client-only animasyon stilleri (SSR-safe)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('sharecenter-toast-style')) return;
    const style = document.createElement('style');
    style.id = 'sharecenter-toast-style';
    style.innerHTML = `
      /* Toast fade */
      @keyframes fadeInOut {
        0%   { opacity: 0; transform: translateY(8px); }
        12%  { opacity: 1; transform: translateY(0); }
        88%  { opacity: 1; }
        100% { opacity: 0; transform: translateY(8px); }
      }
      .animate-fadeInOut { animation: fadeInOut 3.2s ease-in-out forwards; }

      /* X button sheen sweep */
      @keyframes x-sweep {
        0%   { transform: translateX(-140%); }
        60%  { transform: translateX(160%); }
        100% { transform: translateX(160%); }
      }
      .animate-x-sweep { animation: x-sweep 1.2s ease-out 1; }
    `;
    document.head.appendChild(style);
  }, []);

  useMemo(() => detectInAppBrowser(), []); // gerekirse ileride kullanırız

  async function recordShare(channel: Channel) {
    if (!walletBase58) return;
    try {
      await fetch('/api/share/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletBase58,
          channel,
          context,
          txId: txId ?? null,
        }),
      });
    } catch (e) {
      console.warn('[ShareCenter] record error', e);
    }
  }

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // X aktif, diğerleri şimdilik toast
  const openChannel = useCallback(
    async (channel: Channel) => {
      if (channel === 'twitter') {
        await openShareChannel('twitter', payload); // anchor.click ile açar
        await recordShare('twitter');
        onOpenChange(false);
        return;
      }
      // Geçici bilgilendirme
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

  // “soft brand on black” buton baz sınıfı
  const softBase =
    'relative rounded-xl px-3 py-2 text-sm font-semibold text-white whitespace-nowrap ring-1 ring-white/10 bg-zinc-950';

  const body = (
    // pointer-events düzeltmesi: dış kabuk none, overlay ve kart auto
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/60 pointer-events-auto"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-[92%] max-w-[420px] rounded-2xl border border-white/10 bg-zinc-900 p-5 text-white shadow-[0_0_24px_rgba(255,0,255,0.12)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-transparent bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text">
              {heading}
            </h3>
            <button
              type="button"
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
            {/* X — vivid dark→light blue + glass + glow + sheen */}
            <button
              type="button"
              onClick={() => openChannel('twitter')}
              className="group relative overflow-hidden rounded-xl px-3 py-2 text-sm font-semibold text-white whitespace-nowrap
                         ring-2 ring-blue-300/40 bg-gradient-to-r from-[#072E86] via-[#1E74FF] to-[#8FDBFF]
                         shadow-[0_0_14px_rgba(56,189,248,0.45)]
                         backdrop-blur-sm hover:brightness-110 hover:shadow-[0_0_20px_rgba(56,189,248,0.65)]
                         active:translate-y-[1px] transition"
            >
              <span className="relative z-[1]">X</span>
              <span className="pointer-events-none absolute inset-0 rounded-xl opacity-30
                               bg-[radial-gradient(120%_100%_at_50%_-10%,rgba(255,255,255,0.35),rgba(255,255,255,0)_60%)]" />
              <span className="pointer-events-none absolute top-0 -left-1/3 h-full w-1/3
                               translate-x-[-140%] bg-gradient-to-r from-white/30 via-white/60 to-white/10
                               blur-[6px] rounded-xl opacity-0
                               group-hover:opacity-100 group-hover:animate-x-sweep" />
            </button>

            {/* Telegram — black base + soft brand wash */}
            <button
              type="button"
              onClick={() => openChannel('telegram')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(38,165,228,0.22)_0%,rgba(0,0,0,0.82)_45%)] hover:brightness-110`}
            >
              Telegram
            </button>

            {/* WhatsApp — black base + soft brand wash */}
            <button
              type="button"
              onClick={() => openChannel('whatsapp')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(37,211,102,0.22)_0%,rgba(0,0,0,0.82)_45%)] hover:brightness-110`}
            >
              Whatsapp
            </button>

            {/* Email — black base + soft neutral wash */}
            <button
              type="button"
              onClick={() => openChannel('email')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(156,163,175,0.22)_0%,rgba(0,0,0,0.82)_45%)] hover:brightness-110`}
            >
              Email
            </button>

            {/* Instagram — multi wash */}
            <button
              type="button"
              onClick={() => openChannel('instagram')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(245,133,41,0.22)_0%,rgba(214,41,118,0.22)_35%,rgba(79,91,213,0.22)_70%,rgba(0,0,0,0.84)_100%)] hover:brightness-110`}
            >
              Instagram
            </button>

            {/* TikTok — dual wash */}
            <button
              type="button"
              onClick={() => openChannel('tiktok')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(254,44,85,0.22)_0%,rgba(0,242,234,0.22)_35%,rgba(0,0,0,0.84)_100%)] hover:brightness-110`}
            >
              Tiktok
            </button>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={handleCopy}
              className="w-full rounded-xl px-3 py-3 text-sm font-semibold text-zinc-900
                         bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-300
                         ring-1 ring-white/10 hover:brightness-105 transition"
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
