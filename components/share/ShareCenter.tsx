// components/share/ShareCenter.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SharePayload, Channel } from './intent';
import {
  buildTwitterIntent,
  buildTelegramWeb,
  buildWhatsAppWeb,
  buildEmailIntent,
  APP_LINKS,
  buildCopyText,
} from './intent';
import { openInNewTab, navigateSameTab } from './open';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload;          // { url, text, hashtags?, via?, utm?, subject? }
  context: 'profile' | 'contribution' | 'leaderboard' | 'success';
  txId?: string;
  walletBase58?: string | null;   // opsiyonel; puan yazımı için kullanılabilir
  onAfterShare?: (args: { channel: string; context: string; txId?: string }) => void | Promise<void>;
};

// Basit UA kontrolü — sadece kaba ayırım için:
const isMobile = () =>
  typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// Renk paleti: context’e göre ufak tema farkları (buton vurgusu vb.)
const CONTEXT_ACCENT: Record<Props['context'], string> = {
  profile: 'from-indigo-600 to-purple-600',
  contribution: 'from-blue-600 to-cyan-600',
  leaderboard: 'from-pink-600 to-rose-600',
  success: 'from-emerald-600 to-lime-600',
};

// Intent üreticileri (X her zaman çalışır; Telegram/WhatsApp: mobilde app → web fallback)
function getIntentUrls(ch: Channel, p: SharePayload): string[] {
  switch (ch) {
    case 'twitter':   return [buildTwitterIntent(p)];
    case 'telegram':  return APP_LINKS.telegram(p);
    case 'whatsapp':  return APP_LINKS.whatsapp(p);
    case 'email':     return [buildEmailIntent(p)];
    case 'instagram': return APP_LINKS.instagram(p);
    case 'tiktok':    return APP_LINKS.tiktok(p);
    default:          return [];
  }
}

// Bir dizi URI’yi sırayla dene: önce app-scheme (mobilde), olmazsa web.
async function openIntentWithFallback(urls: string[]) {
  if (urls.length === 0) return;
  const first = urls[0];
  // App scheme ise (ör. whatsapp://) mobilde aynı sekme yönlendirme daha stabil
  const trySame = first.startsWith('whatsapp://') || first.startsWith('tg://') || first.startsWith('instagram://') || first.startsWith('tiktok://') || first.startsWith('snssdk');
  for (const u of urls) {
    try {
      if (trySame) {
        navigateSameTab(u);
      } else {
        openInNewTab(u);
      }
      // bir URL açmayı denedikten sonra döngüden çık (tarayıcı engellese bile bir sonraki satıra geçmeyiz)
      return;
    } catch {
      // sıradaki fallback’i dene
      continue;
    }
  }
}

export default function ShareCenter({
  open,
  onOpenChange,
  payload,
  context,
  txId,
  walletBase58,
  onAfterShare,
}: Props) {

  // UI: copy feedback & general message
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Escape close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Web Share API (mobil tarayıcıda share sheet)
  const canUseWebShare = typeof navigator !== 'undefined' && !!(navigator as any).share;

  const accent = CONTEXT_ACCENT[context];

  const doAfterShare = useCallback(async (channel: Channel) => {
    try {
      await onAfterShare?.({ channel, context, txId });
    } finally {
      onOpenChange(false);
    }
  }, [onAfterShare, context, txId, onOpenChange]);

  const shareViaWebAPI = useCallback(async () => {
    if (!canUseWebShare) return;
    try {
      const link = payload.url;
      const text = payload.text;
      const title = payload.subject || 'Share';
      await (navigator as any).share({ title, text, url: link });
      await doAfterShare('copy'); // WebShare için ‘copy’ gibi nötr kanal sayalım (istersen ‘webshare’ ekleriz)
    } catch {
      // iptal/başarısız: sessizce yoksay
    }
  }, [canUseWebShare, payload, doAfterShare]);

  const handleCopy = useCallback(async () => {
    try {
      const txt = buildCopyText(payload);
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setNote('Text copied. Open the app and paste.');
      setTimeout(() => setCopied(false), 1500);
      await doAfterShare('copy');
    } catch {
      // ignore
    }
  }, [payload, doAfterShare]);

  const share = useCallback(async (channel: Channel) => {
    // Instagram/TikTok: önce otomatik kopyalayalım, sonra uygulamayı açalım
    if (channel === 'instagram' || channel === 'tiktok') {
      try {
        const txt = buildCopyText(payload);
        await navigator.clipboard.writeText(txt);
        setCopied(true);
        setNote('Caption copied. App is opening… Paste into your post/story.');
        setTimeout(() => setCopied(false), 1500);
      } catch { /* noop */ }
    }

    // Telegram/WhatsApp: mobilde app-scheme, değilse web fallback
    const urls = getIntentUrls(channel, payload);
    await openIntentWithFallback(urls);
    await doAfterShare(channel);
  }, [payload, doAfterShare]);

  if (!open) return null;

  const small = 'rounded-lg px-3 py-2 text-sm font-semibold transition';
  const block = 'w-full rounded-lg px-3 py-2 text-sm font-semibold transition';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Arka plan */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
        style={{ touchAction: 'none' }}
      />
      {/* İçerik */}
      <div className="relative z-10 w-[92%] max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-white shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Share</h3>
          <button
            className="rounded-md px-2 py-1 text-sm hover:bg-zinc-800"
            onClick={() => onOpenChange(false)}
          >
            ✕
          </button>
        </div>

        {/* Payload preview */}
        <p className="mb-4 text-xs text-zinc-300 break-words whitespace-pre-line">
          {payload.text}
        </p>

        {/* Web Share (mobil paylaşımlarda yerel sheet) */}
        {canUseWebShare && (
          <button
            onClick={shareViaWebAPI}
            className={`mb-4 ${block} bg-gradient-to-r ${accent} hover:opacity-90`}
          >
            Share via device…
          </button>
        )}

        {/* Büyük ızgara: tüm kanallar */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => share('twitter')}
            className={`${small} bg-blue-600 hover:bg-blue-700`}
          >
            X / Twitter
          </button>
          <button
            onClick={() => share('telegram')}
            className={`${small} bg-sky-600 hover:bg-sky-700`}
          >
            Telegram
          </button>
          <button
            onClick={() => share('whatsapp')}
            className={`${small} bg-green-600 hover:bg-green-700`}
          >
            WhatsApp
          </button>

          <button
            onClick={() => share('email')}
            className={`${small} bg-emerald-600 hover:bg-emerald-700`}
          >
            Email
          </button>
          <button
            onClick={() => share('instagram')}
            className={`${small} bg-pink-600 hover:bg-pink-700`}
          >
            Instagram
          </button>
          <button
            onClick={() => share('tiktok')}
            className={`${small} bg-gray-700 hover:bg-gray-600`}
          >
            TikTok
          </button>

          <button
            onClick={handleCopy}
            className={`${small} bg-zinc-700 hover:bg-zinc-600 col-span-3`}
          >
            Copy text & link
          </button>
        </div>

        {note && (
          <p className="mt-3 text-xs text-zinc-400 italic">{note}</p>
        )}
      </div>
    </div>
  );
}
