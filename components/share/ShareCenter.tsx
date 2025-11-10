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

// ---- platform helpers
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isAndroid = /Android/i.test(ua);
const isIOS = /iPhone|iPad|iPod/i.test(ua);

// Android Chrome için intent:// formatı (çok daha stabil)
function openAndroidIntent(intentUrl: string, webFallback?: string) {
  try {
    // kullanıcı jestiyle çağrıldığı için izin veriliyor
    window.location.href = intentUrl;
    // 700-900ms içinde dönmezse web’e düş
    setTimeout(() => {
      if (webFallback) window.location.href = webFallback;
    }, 900);
  } catch {
    if (webFallback) window.location.href = webFallback;
  }
}

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
      // 1) X ve Email: mevcut davranış (stabil)
      if (channel === 'twitter') {
        window.open(buildTwitterIntent(payload), '_blank', 'noopener,noreferrer');
        await recordShare('twitter');
        onOpenChange(false);
        return;
      }
      if (channel === 'email') {
        window.location.href = buildEmailIntent(payload);
        await recordShare('email');
        onOpenChange(false);
        return;
      }
      if (channel === 'copy') {
        try { await navigator.clipboard.writeText(buildCopyText(payload)); } catch {}
        await recordShare('copy');
        onOpenChange(false);
        return;
      }
  
      // 2) WhatsApp
      if (channel === 'whatsapp') {
        const text = encodeURIComponent(buildCopyText(payload));
        if (isAndroid) {
          // Uygulamayı doğrudan açar; yoksa Play Store → web
          openAndroidIntent(
            `intent://send?text=${text}#Intent;scheme=whatsapp;package=com.whatsapp;end`,
            buildWhatsAppWeb(payload)
          );
        } else if (isIOS) {
          // iOS Safari: custom scheme
          window.location.href = `whatsapp://send?text=${text}`;
          // kısa bekleme → olmazsa web
          setTimeout(() => window.open(buildWhatsAppWeb(payload), '_blank'), 900);
        } else {
          // Desktop: web
          window.open(buildWhatsAppWeb(payload), '_blank', 'noopener,noreferrer');
        }
        await recordShare('whatsapp');
        onOpenChange(false);
        return;
      }
  
      // 3) Telegram
      if (channel === 'telegram') {
        const web = buildTelegramWeb(payload);
        const url = encodeURIComponent(payload.url);
        const text = encodeURIComponent(payload.text);
  
        if (isAndroid) {
          openAndroidIntent(
            // Telegram’ın paylaşım intent’i
            `intent://share/url?url=${url}&text=${text}#Intent;scheme=https;package=org.telegram.messenger;end`,
            web
          );
        } else if (isIOS) {
          // App deeplink → açılmazsa web
          window.location.href = `tg://msg_url?url=${url}&text=${text}`;
          setTimeout(() => window.open(web, '_blank'), 900);
        } else {
          window.open(web, '_blank', 'noopener,noreferrer');
        }
        await recordShare('telegram');
        onOpenChange(false);
        return;
      }
  
      // En iyi deneyim: metni panoya kopyala + uygulamayı aç + olmazsa web
      if (channel === 'instagram' || channel === 'tiktok') {
        try { await navigator.clipboard.writeText(buildCopyText(payload)); } catch {}
        if (isAndroid) {
          const pkg = channel === 'instagram' ? 'com.instagram.android' : 'com.zhiliaoapp.musically';
          const fb  = channel === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/explore';
          openAndroidIntent(`intent://#Intent;scheme=${channel};package=${pkg};end`, fb);
        } else if (isIOS) {
          const scheme = channel === 'instagram' ? 'instagram://app' : 'tiktok://';
          const fb     = channel === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/explore';
          window.location.href = scheme;
          setTimeout(() => window.open(fb, '_blank'), 900);
        } else {
          const fb = channel === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/explore';
          window.open(fb, '_blank', 'noopener,noreferrer');
        }
        await recordShare(channel);
        onOpenChange(false);
        return;
      }
  
      // 5) Son çare: Web Share API (kullanıcı cihazı seçer)
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Coincarnation', text: payload.text, url: payload.url });
          await recordShare(channel);
        } catch { /* kullanıcı iptal etti */ }
        onOpenChange(false);
      }
    },
    [payload, onOpenChange]
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
            <button onClick={() => openPreferApp('twitter')}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700 whitespace-nowrap">
              X
            </button>
            <button onClick={() => openPreferApp('telegram')}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-700 whitespace-nowrap">
              Telegram
            </button>
            <button onClick={() => openPreferApp('whatsapp')}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-700 whitespace-nowrap">
              WhatsApp
            </button>

            <button onClick={() => openPreferApp('email')}
              className="rounded-lg bg-zinc-600 px-3 py-2 text-sm font-semibold hover:bg-zinc-500 whitespace-nowrap">
              Email
            </button>
            <button onClick={() => openPreferApp('instagram')}
              className="rounded-lg bg-pink-600 px-3 py-2 text-sm font-semibold hover:bg-pink-700 whitespace-nowrap">
              Instagram
            </button>
            <button onClick={() => openPreferApp('tiktok')}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-700 whitespace-nowrap">
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
