// components/share/ShareCenter.tsx
'use client';

import React, { useCallback, useEffect } from 'react';
import type { SharePayload } from './intent';
import { buildTwitterIntent, buildTelegramIntent, buildWhatsAppIntent } from './intent';
import { openInNewTab } from './open';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload;          // { url, text, hashtags?, via?, utm? }
  context: string;                // "profile" | "contribution" | ...
  txId?: string;
  onAfterShare?: (args: { channel: string; context: string; txId?: string }) => void | Promise<void>;
};

export default function ShareCenter({
  open,
  onOpenChange,
  payload,
  context,
  txId,
  onAfterShare,
}: Props) {
  // Escape close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const share = useCallback(async (channel: 'twitter' | 'telegram' | 'whatsapp') => {
    let url = '';
    if (channel === 'twitter')  url = buildTwitterIntent(payload);
    if (channel === 'telegram') url = buildTelegramIntent(payload);
    if (channel === 'whatsapp') url = buildWhatsAppIntent(payload);

    openInNewTab(url); // her kanalı yeni sekmede aç

    try {
      await onAfterShare?.({ channel, context, txId });
    } finally {
      onOpenChange(false);
    }
  }, [payload, context, txId, onAfterShare, onOpenChange]);

  if (!open) return null;

  // Minimal, hooks güvenli modal (portal vs. kullanmıyoruz)
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
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

        <p className="mb-4 text-xs text-zinc-300 break-words">
          {payload.text}
        </p>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => share('twitter')}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700"
          >
            X / Twitter
          </button>
          <button
            onClick={() => share('telegram')}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-700"
          >
            Telegram
          </button>
          <button
            onClick={() => share('whatsapp')}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-700"
          >
            WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
