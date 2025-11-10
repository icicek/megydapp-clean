'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { SharePayload, Channel } from '@/components/share/intent';
import {
  buildTwitterIntent,
  buildTelegramWeb,
  buildWhatsAppWeb,
  buildEmailIntent,
  APP_LINKS,
  buildCopyText,
} from '@/components/share/intent';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload;    // { url, text, hashtags?, via?, utm?, subject? }
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
  // ESC kapatma
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // ——— Helpers
  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod|android|mobile/.test(ua);
  }, []);

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

  // Uygulama > Web fallback akışı (aynı sekme tercih)
  const openPreferApp = useCallback(
    async (channel: Channel) => {
      // X/Twitter ve Email zaten web intent (veya mailto) ile stabil
      if (channel === 'twitter') {
        const url = buildTwitterIntent(payload);
        window.open(url, '_blank', 'noopener,noreferrer');
        await recordShare('twitter');
        onOpenChange(false);
        return;
      }
      if (channel === 'email') {
        const url = buildEmailIntent(payload);
        window.location.href = url;
        await recordShare('email');
        onOpenChange(false);
        return;
      }
      if (channel === 'copy') {
        try {
          await navigator.clipboard.writeText(buildCopyText(payload));
        } catch {/* noop */}
        await recordShare('copy');
        onOpenChange(false);
        return;
      }

      // Telegram / WhatsApp / Instagram / TikTok
      const chain = APP_LINKS[channel]?.(payload) ?? [];
      const [appLink, fallback] = [
        chain[0] ?? '',
        chain[chain.length - 1] ?? '',
      ];

      if (isMobile && appLink) {
        // 1) Uygulama deeplink’i aynı sekmede dene
        const before = Date.now();
        window.location.href = appLink;

        // 2) Kısa bekleme → açılmazsa web fallback
        setTimeout(() => {
          // Bazı tarayıcılar app’e geçtiğinde bu timeout çalışmaz;
          // çalışırsa ve app açılmadıysa web fallback ile devam ediyoruz.
          const elapsed = Date.now() - before;
          if (elapsed < 1500 && fallback) {
            window.location.href = fallback;
          }
        }, 800);
      } else {
        // Masaüstü: direkt web fallback
        const web = channel === 'whatsapp' ? buildWhatsAppWeb(payload)
                  : channel === 'telegram' ? buildTelegramWeb(payload)
                  : fallback;
        if (web) window.open(web, '_blank', 'noopener,noreferrer');
      }

      await recordShare(channel);
      onOpenChange(false);
    },
    [payload, isMobile, context, txId, walletBase58, onOpenChange]
  );

  if (!open) return null;

  // Başlık/alt metin – bağlama göre küçük motivasyon cümleleri
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
        {/* Standart ve bağımsız genişlik */}
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

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => openPreferApp('twitter')}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700"
            >
              X / Twitter
            </button>
            <button
              onClick={() => openPreferApp('telegram')}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-700"
            >
              Telegram
            </button>
            <button
              onClick={() => openPreferApp('whatsapp')}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-700"
            >
              WhatsApp
            </button>

            <button
              onClick={() => openPreferApp('email')}
              className="rounded-lg bg-zinc-600 px-3 py-2 text-sm font-semibold hover:bg-zinc-500"
            >
              Email
            </button>
            <button
              onClick={() => openPreferApp('instagram')}
              className="rounded-lg bg-pink-600 px-3 py-2 text-sm font-semibold hover:bg-pink-700"
            >
              Instagram
            </button>
            <button
              onClick={() => openPreferApp('tiktok')}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-700"
            >
              TikTok
            </button>
          </div>

          <div className="mt-4">
            <button
              onClick={() => openPreferApp('copy')}
              className="w-full rounded-lg bg-orange-600 px-3 py-3 text-sm font-semibold hover:bg-orange-700"
            >
              Copy text
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // 🔒 Portal: her zaman <body>’ye renderla (layout’tan bağımsız)
  if (typeof document !== 'undefined') {
    return createPortal(body, document.body);
  }
  return body;
}
