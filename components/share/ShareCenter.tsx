'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SharePayload, Channel } from '@/components/share/intent';
import { detectInAppBrowser } from '@/components/share/browser';
import { openShareChannel } from '@/components/share/openShare';

// 🟢 Basit toast bildirimi bileşeni
function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] bg-zinc-800 text-white text-sm px-4 py-2 rounded-lg border border-zinc-600 shadow-lg animate-fadeInOut">
      {message}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload; // { url, text, hashtags?, via?, utm?, subject? }
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

  const { inApp } = useMemo(() => detectInAppBrowser(), []);

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

  // 🔹 Geçici toast mesajı göster
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // 🔹 X (Twitter) aktif
  const openChannel = useCallback(
    async (channel: Channel) => {
      if (channel === 'twitter') {
        await openShareChannel('twitter', payload);
        await recordShare('twitter');
        onOpenChange(false);
        return;
      }

      // 🟠 Diğer platformlar için geçici bilgilendirme
      showToast(
        "Sharing for this app isn’t live yet — but you’ll still earn CorePoints when you copy and share manually!"
      );
    },
    [payload, walletBase58, context, txId, onOpenChange]
  );

  // 🔹 Copy text aktif
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

  const body = (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        {/* Kart alanı */}
        <div className="w-[92%] max-w-[420px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-white shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{heading}</h3>
            <button
              className="rounded-md px-2 py-1 text-sm hover:bg-zinc-800"
              onClick={() => onOpenChange(false)}
            >
              ✕
            </button>
          </div>

          {sub && <p className="mb-4 text-sm text-zinc-300">{sub}</p>}

          <div className="mb-4 rounded-xl bg-zinc-800 p-3 text-xs text-zinc-200 break-words">
            {payload.text}
          </div>

          {/* Butonlar */}
          <div className="grid grid-cols-3 gap-3">
            {/* 🟢 X aktif */}
            <button
              onClick={() => openChannel('twitter')}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700 whitespace-nowrap"
            >
              X
            </button>

            {/* 🔴 Diğerleri kapalı */}
            {['telegram', 'whatsapp', 'email', 'instagram', 'tiktok'].map((ch) => (
              <button
                key={ch}
                onClick={() => openChannel(ch as Channel)}
                disabled
                className="rounded-lg bg-zinc-700/70 px-3 py-2 text-sm font-semibold text-zinc-400 cursor-not-allowed whitespace-nowrap"
              >
                {ch.charAt(0).toUpperCase() + ch.slice(1)}
              </button>
            ))}
          </div>

          {/* Copy butonu */}
          <div className="mt-4">
            <button
              onClick={handleCopy}
              className="w-full rounded-lg bg-orange-600 px-3 py-3 text-sm font-semibold hover:bg-orange-700"
            >
              Copy text
            </button>
          </div>
        </div>
      </div>

      {/* Toast alanı */}
      {toast && <Toast message={toast} />}
    </div>
  );

  // Portal
  if (typeof document !== 'undefined') {
    return createPortal(body, document.body);
  }
  return body;
}

/* ---- Basit fade animasyonu ---- */
const style = document.createElement('style');
style.innerHTML = `
@keyframes fadeInOut {
  0% { opacity: 0; transform: translateY(10px); }
  10% { opacity: 1; transform: translateY(0); }
  90% { opacity: 1; }
  100% { opacity: 0; transform: translateY(10px); }
}
.animate-fadeInOut {
  animation: fadeInOut 3.5s ease-in-out forwards;
}
`;
if (typeof document !== 'undefined') document.head.appendChild(style);
