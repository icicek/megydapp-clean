// components/share/ShareCenter.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SharePayload, Channel } from '@/components/share/intent';
import { buildCopyText } from '@/components/share/intent';
import { detectInAppBrowser } from '@/components/share/browser';
import { openShareChannel } from '@/components/share/openShare';

// —— Toast (renkli kutu + pozisyon + genişlik) ——
type ToastVariant = 'info' | 'success' | 'error';

function Toast({
  message,
  position = 'bottom',
  wide = true,
  variant = 'info',
}: {
  message: string;
  position?: 'top' | 'bottom';
  wide?: boolean;
  variant?: ToastVariant;
}) {
  const posClass =
    position === 'top' ? 'top-6 md:top-10' : 'bottom-16 md:bottom-24';

  const widthClass = wide ? 'w-[min(720px,calc(100vw-2rem))]' : 'w-auto max-w-[90vw]';

  const [copyReward, setCopyReward] = useState<number | null>(null);

  const color =
    variant === 'success'
      ? 'bg-emerald-600/90 ring-emerald-300/60 shadow-[0_0_24px_rgba(16,185,129,0.35)]'
      : variant === 'error'
      ? 'bg-rose-600/90 ring-rose-300/60 shadow-[0_0_24px_rgba(244,63,94,0.35)]'
      : 'bg-sky-600/90 ring-sky-300/60 shadow-[0_0_24px_rgba(56,189,248,0.35)]';

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-[20000] ${posClass} ${widthClass}
                  rounded-xl border border-white/10 px-4 py-3 text-sm text-white
                  backdrop-blur-md animate-fadeInOut ring-1 ${color}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload; // 🔹 Tekrar non-null
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
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastPos, setToastPos] = useState<'top' | 'bottom'>('bottom');
  const [toastWide, setToastWide] = useState<boolean>(true);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('info');
  const [shortUrl, setShortUrl] = useState<string | undefined>(payload.shortUrl);
  const [copyReward, setCopyReward] = useState<number | null>(null);

  // —— Tek noktadan buton yüksekliği
  const BTN_H = 'h-9 md:h-8';

  // “soft brand on black”
  const softBase =
    `relative ${BTN_H} rounded-xl px-3 text-sm font-semibold text-white ` +
    `whitespace-nowrap ring-1 ring-white/10 bg-zinc-950 ` +
    `flex items-center justify-center`;

  // ESC ile kapatma
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Animasyon stilleri
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('sharecenter-toast-style')) return;
    const style = document.createElement('style');
    style.id = 'sharecenter-toast-style';
    style.innerHTML = `
      @keyframes fadeInOut {
        0%   { opacity: 0; transform: translateY(8px); }
        12%  { opacity: 1; transform: translateY(0); }
        88%  { opacity: 1; }
        100% { opacity: 0; transform: translateY(8px); }
      }
      .animate-fadeInOut { animation: fadeInOut 3.2s ease-in-out forwards; }

      @keyframes x-sweep {
        0%   { transform: translateX(-140%); }
        60%  { transform: translateX(160%); }
        100% { transform: translateX(160%); }
      }
      .animate-x-sweep { animation: x-sweep 1.2s ease-out 1; }
    `;
    document.head.appendChild(style);
  }, []);

  // —— CorePoint copy reward
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch('/api/corepoints/config', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json().catch(() => null);
        const cfg = j?.config;
        if (!cfg || !mounted) return;

        const shareOther = Number(
          cfg.shareOther ??
            cfg.share_other ??
            cfg.cp_share_other ??
            10,
        );

        const mShare = Number(
          cfg.mShare ??
            cfg.multShare ??
            cfg.cp_mult_share ??
            1,
        );

        const pts = Math.max(0, Math.floor(shareOther * mShare));
        setCopyReward(pts);
      } catch {
        // sessiz fail
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // In-app browser detect (şimdilik sadece side effect)
  useMemo(() => detectInAppBrowser(), []);

  // —— Optional shortener (client)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (payload.shortUrl) return; // already provided
        const res = await fetch(`/api/shorten?u=${encodeURIComponent(payload.url)}`);
        if (!res.ok) return;
        const j = await res.json().catch(() => null);
        if (!mounted) return;
        if (j?.shortUrl && typeof j.shortUrl === 'string' && j.shortUrl.length > 0) {
          setShortUrl(j.shortUrl);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [payload.url, payload.shortUrl]);

  const payloadWithShort: SharePayload =
    shortUrl ? { ...payload, shortUrl } : payload;

  // 🔴 Ortak helper: share eventini gönder
  async function sendShareEvent(channel: Channel) {
    const day = new Date().toISOString().slice(0, 10);

    const body: any = {
      channel,
      context,
      day,
    };

    if (walletBase58) {
      body.wallet = walletBase58;
    }
    if (txId && channel === 'twitter') {
      body.txId = txId;
    }

    try {
      console.log('[ShareCenter] POST /api/share/record', body);

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
        const ok = navigator.sendBeacon('/api/share/record', blob);
        if (!ok) {
          console.warn('[ShareCenter] sendBeacon failed, falling back to fetch');
          await fetch('/api/share/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive: true,
          });
        }
      } else {
        await fetch('/api/share/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        });
      }
    } catch (e) {
      console.warn('[ShareCenter] sendShareEvent error', e);
    }
  }

  const showToast = (
    msg: string,
    pos: 'top' | 'bottom' = 'bottom',
    wide = true,
    variant: ToastVariant = 'info',
  ) => {
    setToastMsg(msg);
    setToastPos(pos);
    setToastWide(wide);
    setToastVariant(variant);
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToastMsg(null), 3200);
  };

  // X aktif, diğerleri toast
  const openChannel = useCallback(
    (channel: Channel) => {
      if (channel === 'twitter') {
        console.log('[ShareCenter] twitter clicked', {
          context,
          txId,
          walletBase58,
          payload: payloadWithShort,
        });
  
        // 🔹 1) X intent URL'ini kendimiz kuruyoruz
        const text = payloadWithShort.text ?? '';
        const link = payloadWithShort.shortUrl || payloadWithShort.url || '';
        let intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  
        if (link) {
          // İki satır arası boşluk
          intentUrl += `%0A%0A${encodeURIComponent(link)}`;
        }
  
        // 🔹 2) Önce pencereyi AÇ (senkron, await YOK → popup blocker friendly)
        if (typeof window !== 'undefined') {
          window.open(intentUrl, '_blank', 'noopener,noreferrer');
        }
  
        // 🔹 3) CP event'i arkadan fire-and-forget
        try {
          void sendShareEvent('twitter');
        } catch (e) {
          console.error('[ShareCenter] sendShareEvent(twitter) threw', e);
        }
  
        // 🔹 4) En son modalı kapat
        onOpenChange(false);
        return;
      }
  
      // Diğer kanallar: şimdilik sadece toast
      showToast(
        "Sharing for this app isn’t live yet — but you’ll still earn CorePoints when you copy and share manually!",
        'bottom',
        true,
        'info',
      );
    },
    [payloadWithShort, onOpenChange, context, txId, walletBase58],
  );  

  // Copy text — X ile aynı birleşik format
  const handleCopy = async () => {
    try {
      const composed = `${payloadWithShort.text}\n\n${
        payloadWithShort.shortUrl ?? payloadWithShort.url
      }`;
      await navigator.clipboard.writeText(composed);
      await sendShareEvent('copy');
      showToast('Post text copied — share manually to earn CorePoints!', 'top', false, 'success');
    } catch (e) {
      console.error('[ShareCenter] copy failed', e);
      showToast('Could not copy text.', 'top', false, 'error');
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

  const XLogo = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" focusable="false">
      <path
        fill="currentColor"
        d="M18.9 2H21l-7.5 8.6L22 22h-6.8l-5.3-6.4L3.8 22H2l8-9.2L2 2h6.8l5 6 5.1-6z"
      />
    </svg>
  );

  const body = (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/60 pointer-events-auto"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-[92%] max-w-[460px] rounded-2xl
                     border border-white/20 ring-1 ring-white/10
                     bg-black p-5 text-white
                     shadow-[0_0_32px_rgba(255,255,255,0.06)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-transparent bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text">
              {heading}
            </h3>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm hover:bg-white/5"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>

          {sub && <p className="mb-4 text-sm text-zinc-300">{sub}</p>}

          <div className="mb-4 break-words rounded-xl border border-white/10 bg-zinc-800/70 p-3 text-xs text-zinc-200">
            {payload.text}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => openChannel('twitter')}
              className={`group relative ${BTN_H} overflow-hidden rounded-xl px-3 text-sm font-semibold text-white
                         ring-2 ring-blue-300/40 bg-gradient-to-r from-[#072E86] via-[#1E74FF] to-[#8FDBFF]
                         shadow-[0_0_14px_rgba(56,189,248,0.45)]
                         backdrop-blur-sm hover:brightness-110 hover:shadow-[0_0_20px_rgba(56,189,248,0.65)]
                         active:translate-y-[1px] transition flex items-center justify-center`}
              aria-label="Share on X"
              title="Share on X"
            >
              <span className="relative z-[1] inline-flex items-center">
                <XLogo />
              </span>
              <span className="pointer-events-none absolute inset-0 rounded-xl opacity-30
                               bg-[radial-gradient(120%_100%_at_50%_-10%,rgba(255,255,255,0.35),rgba(255,255,255,0)_60%)]" />
              <span className="pointer-events-none absolute top-0 -left-1/3 h-full w-1/3
                               translate-x-[-140%] bg-gradient-to-r from-white/30 via-white/60 to-white/10
                               blur-[6px] rounded-xl opacity-0 group-hover:opacity-100 group-hover:animate-x-sweep" />
            </button>

            <button
              type="button"
              onClick={() => openChannel('telegram')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(38,165,228,0.22)_0%,rgba(0,0,0,0.82)_45%)] hover:brightness-110`}
            >
              Telegram
            </button>

            <button
              type="button"
              onClick={() => openChannel('whatsapp')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(37,211,102,0.22)_0%,rgba(0,0,0,0.82)_45%)] hover:brightness-110`}
            >
              WhatsApp
            </button>

            <button
              type="button"
              onClick={() => openChannel('email')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(156,163,175,0.22)_0%,rgba(0,0,0,0.82)_45%)] hover:brightness-110`}
            >
              Email
            </button>

            <button
              type="button"
              onClick={() => openChannel('instagram')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(225,48,108,0.28)_0%,rgba(0,0,0,0.86)_70%)] hover:brightness-110`}
            >
              Instagram
            </button>

            <button
              type="button"
              onClick={() => openChannel('tiktok')}
              className={`${softBase} bg-[linear-gradient(180deg,rgba(0,242,234,0.28)_0%,rgba(0,0,0,0.86)_70%)] hover:brightness-110`}
            >
              TikTok
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
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              Paste into any app to <span className="font-semibold text-zinc-200">earn</span>
              {typeof copyReward === 'number' && copyReward > 0 && (
                <> (+{copyReward} CorePoint)</>
              )}
              .
            </p>
          </div>
        </div>
      </div>

      {toastMsg && (
        <Toast message={toastMsg} position={toastPos} wide={toastWide} variant={toastVariant} />
      )}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(body, document.body);
  }
  return body;
}
