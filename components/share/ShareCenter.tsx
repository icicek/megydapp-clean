// components/share/ShareCenter.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

/* ---------------- Types ---------------- */
export type ShareChannel =
  | 'x'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy-link'
  | 'download-image'
  | 'system';

export type ShareContext = 'profile' | 'contribution' | 'leaderboard' | 'success';

export type SharePayload = {
  text?: string;
  url?: string;
  hashtags?: string[]; // ['MEGY','Coincarnation']
  via?: string;        // 'Coincarnation'
  imageUrl?: string;   // indirilebilir görsel
  utm?: string;        // "utm_source=..&utm_medium=.."
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: SharePayload;
  context: ShareContext | string;
  txId?: string;
  imageId?: string;
  onAfterShare?: (args: { channel: ShareChannel; context: string; txId?: string; imageId?: string }) => void | Promise<void>;
};

/* ------------- Small utilities (self-contained) ------------- */
const isInAppWallet = () => {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
  return ua.includes('phantom') || ua.includes('solflare') || ua.includes('backpack') || ua.includes('metamask') || ua.includes('rainbow');
};

type OpenTarget = '_self' | '_blank' | 'popup';
function openURL(url: string, target: OpenTarget = '_self') {
  if (target === '_self') {
    window.location.href = url;
    return;
  }
  if (target === 'popup') {
    window.open(url, 'share', 'noopener,noreferrer,width=720,height=640');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function xIntentUrl(opts: { text?: string; url?: string; hashtags?: string[]; via?: string }) {
  const params = new URLSearchParams();
  if (opts.text) params.set('text', opts.text);
  if (opts.url) params.set('url', opts.url);
  if (opts.hashtags?.length) params.set('hashtags', opts.hashtags.join(','));
  if (opts.via) params.set('via', opts.via);
  return `https://x.com/intent/post?${params.toString()}`;
}

function telegramShareUrl(opts: { text?: string; url?: string }) {
  const params = new URLSearchParams();
  if (opts.url) params.set('url', opts.url);
  if (opts.text) params.set('text', opts.text);
  return `https://t.me/share/url?${params.toString()}`;
}

function whatsappShareUrl(opts: { text?: string; url?: string }) {
  const text = [opts.text, opts.url].filter(Boolean).join(' ');
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

function mailtoUrl(opts: { subject?: string; body?: string }) {
  const params = new URLSearchParams();
  if (opts.subject) params.set('subject', opts.subject);
  if (opts.body) params.set('body', opts.body);
  return `mailto:?${params.toString()}`;
}

/* ---------------- Component ---------------- */
export default function ShareCenter(props: Props) {
  const { open, onOpenChange, payload, context, txId, imageId, onAfterShare } = props;
  const [copied, setCopied] = useState(false);

  // tek bir metin oluştur (text + UTM + url)
  const composedUrl = useMemo(() => {
    if (!payload.url) return undefined;
    if (!payload.utm) return payload.url;
    try {
      const u = new URL(payload.url);
      const pairs = payload.utm.split('&').filter(Boolean);
      pairs.forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && typeof v !== 'undefined') u.searchParams.set(k, v);
      });
      return u.toString();
    } catch {
      return payload.url; // URL parse edilemezse ham değeri kullan
    }
  }, [payload.url, payload.utm]);

  const baseText = useMemo(() => payload.text || '', [payload.text]);

  const handleAfter = useCallback(
    async (channel: ShareChannel) => {
      try {
        await onAfterShare?.({ channel, context: String(context), txId, imageId });
      } finally {
        // modalı açık bırakıyoruz; istersen kapat:
        // onOpenChange(false);
      }
    },
    [onAfterShare, context, txId, imageId, onOpenChange]
  );

  const shareSystem = useCallback(async () => {
    if (navigator.share && !isInAppWallet()) {
      try {
        await navigator.share({
          text: baseText,
          url: composedUrl,
        });
        await handleAfter('system');
        return;
      } catch {
        // iptal/fallback
      }
    }
    // fallback: X intent
    const href = xIntentUrl({ text: baseText, url: composedUrl, hashtags: payload.hashtags, via: payload.via });
    openURL(href, '_self');
    await handleAfter('x');
  }, [baseText, composedUrl, payload.hashtags, payload.via, handleAfter]);

  const shareX = useCallback(async () => {
    const href = xIntentUrl({ text: baseText, url: composedUrl, hashtags: payload.hashtags, via: payload.via });
    openURL(href, '_self');
    await handleAfter('x');
  }, [baseText, composedUrl, payload.hashtags, payload.via, handleAfter]);

  const shareTelegram = useCallback(async () => {
    const href = telegramShareUrl({ text: baseText, url: composedUrl });
    openURL(href, '_self');
    await handleAfter('telegram');
  }, [baseText, composedUrl, handleAfter]);

  const shareWhatsApp = useCallback(async () => {
    const href = whatsappShareUrl({ text: baseText, url: composedUrl });
    openURL(href, '_self');
    await handleAfter('whatsapp');
  }, [baseText, composedUrl, handleAfter]);

  const shareEmail = useCallback(async () => {
    const body = [baseText, composedUrl].filter(Boolean).join(' ');
    const href = mailtoUrl({ subject: 'Coincarnation', body });
    openURL(href, '_self');
    await handleAfter('email');
  }, [baseText, composedUrl, handleAfter]);

  const copyLink = useCallback(async () => {
    const text = [baseText, composedUrl].filter(Boolean).join(' ');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await handleAfter('copy-link');
    } catch {
      // no-op
    }
  }, [baseText, composedUrl, handleAfter]);

  const downloadImage = useCallback(async () => {
    if (!payload.imageUrl) return;
    try {
      const a = document.createElement('a');
      a.href = payload.imageUrl;
      a.download = 'coincarnation-share.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      await handleAfter('download-image');
    } catch {
      // no-op
    }
  }, [payload.imageUrl, handleAfter]);

  // ESC ile kapat
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      aria-modal
      role="dialog"
      className="fixed inset-0 z-[1000] flex items-center justify-center"
    >
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* panel */}
      <div className="relative w-[92vw] max-w-xl rounded-2xl border border-white/10 bg-zinc-900 text-white shadow-2xl p-5">
        {/* header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">Share</span>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* grid buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={shareX}
            className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <span>Post on X</span>
          </button>

          <button
            onClick={shareTelegram}
            className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <span>Telegram</span>
          </button>

          <button
            onClick={shareWhatsApp}
            className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <span>WhatsApp</span>
          </button>

          <button
            onClick={shareEmail}
            className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <span>Email</span>
          </button>

          <button
            onClick={copyLink}
            className="h-11 rounded-xl bg-white/10 hover:bg-white/20 transition flex items-center justify-center gap-2"
          >
            <span>{copied ? '✅ Copied!' : 'Copy Link'}</span>
          </button>

          <button
            onClick={downloadImage}
            disabled={!payload.imageUrl}
            className={`h-11 rounded-xl transition flex items-center justify-center gap-2 ${
              payload.imageUrl
                ? 'bg-white/10 hover:bg-white/20'
                : 'bg-white/5 text-white/40 cursor-not-allowed'
            }`}
          >
            <span>Download Image</span>
          </button>
        </div>

        {/* system share */}
        <div className="mt-5 text-center">
          <button
            onClick={shareSystem}
            className="mx-auto inline-flex h-10 items-center justify-center rounded-lg bg-white/10 px-4 hover:bg-white/20 transition"
          >
            Use system share
          </button>
        </div>

        {/* helper text */}
        <p className="mt-4 text-center text-xs text-white/60">
          Your post text and link are pre-filled. You can edit them in the target app before posting.
        </p>
      </div>
    </div>
  );
}
