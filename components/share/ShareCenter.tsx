'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { SharePayload, Channel } from '@/components/share/intent';
import { detectInAppBrowser, openWithAnchor } from '@/components/share/browser';
import { openShareChannel } from '@/components/share/openShare';

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
  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const { inApp } = useMemo(() => detectInAppBrowser(), []);

  // (Kept for future conditions or analytics granularity)
  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const u = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod|android|mobile/.test(u);
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

  // Single entry for all channels → centralized in openShareChannel
  const openChannel = useCallback(
    async (channel: Channel) => {
      await openShareChannel(channel, payload);
      await recordShare(channel);
      onOpenChange(false);
    },
    [payload, walletBase58, context, txId, onOpenChange]
  );

  if (!open) return null;

  const heading = 'Share';
  const sub = {
    profile: 'Invite your circle—your CorePoint grows with every ripple.',
    contribution: 'Your revival matters. Share it and inspire the next Coincarnator!',
    leaderboard: 'Flex your rank—one share could push you up the board.',
    success: 'Blast your revival—let the world see your $MEGY journey!',
  }[context];

  // In-app browser notice
  const InAppBar = inApp ? (
    <div className="mb-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-200">
      Some in-app browsers block app sharing. Tap <b>Open in Browser</b> below, then try again.
      <div className="mt-2">
        <button
          onClick={() => openWithAnchor(window.location.href, '_blank')}
          className="rounded-md bg-yellow-600/80 px-2 py-1 text-[11px] font-semibold hover:bg-yellow-600"
        >
          Open in Browser
        </button>
      </div>
    </div>
  ) : null;

  const body = (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        {/* Fixed, predictable width */}
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

          {InAppBar}

          {/* Preview text block */}
          <div className="mb-4 rounded-xl bg-zinc-800 p-3 text-xs text-zinc-200 break-words">
            {payload.text}
          </div>

          {/* Buttons (single-line labels) */}
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => openChannel('twitter')}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700 whitespace-nowrap">
              X
            </button>
            <button onClick={() => openChannel('telegram')}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-700 whitespace-nowrap">
              Telegram
            </button>
            <button onClick={() => openChannel('whatsapp')}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-700 whitespace-nowrap">
              WhatsApp
            </button>

            <button onClick={() => openChannel('email')}
              className="rounded-lg bg-zinc-600 px-3 py-2 text-sm font-semibold hover:bg-zinc-500 whitespace-nowrap">
              Email
            </button>
            <button onClick={() => openChannel('instagram')}
              className="rounded-lg bg-pink-600 px-3 py-2 text-sm font-semibold hover:bg-pink-700 whitespace-nowrap">
              Instagram
            </button>
            <button onClick={() => openChannel('tiktok')}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-700 whitespace-nowrap">
              TikTok
            </button>
          </div>

          <div className="mt-4">
            <button
              onClick={() => openChannel('copy')}
              className="w-full rounded-lg bg-orange-600 px-3 py-3 text-sm font-semibold hover:bg-orange-700"
            >
              Copy text
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Always portal to <body> so layout trees don't matter
  if (typeof document !== 'undefined') {
    return createPortal(body, document.body);
  }
  return body;
}
