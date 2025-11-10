// components/share/ShareCenter.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SharePayload, Channel } from '@/components/share/intent';
import {
  buildTwitterIntent,
  buildTelegramWeb,
  buildWhatsAppWeb,
  buildEmailIntent,
  buildCopyText,
  APP_LINKS,
} from '@/components/share/intent';
import { openInNewTab, navigateSameTab } from './open';

type Theme = 'default' | 'success' | 'leaderboard' | 'profile';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload;   // { url, text, hashtags?, via?, utm?, subject? }
  context: 'profile'|'contribution'|'leaderboard'|'success';
  txId?: string;
  walletBase58?: string | null;
  theme?: Theme;
};

const isMobile = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
};

export default function ShareCenter({
  open,
  onOpenChange,
  payload,
  context,
  txId,
  walletBase58,
  theme = 'default',
}: Props) {
  // ESC kapatma
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const [copied, setCopied] = useState(false);

  // Kanal başına açılış stratejisi (mobilde app -> olmazsa web; desktop’da web)
  const openChannel = useCallback((channel: Channel) => {
    const mobile = isMobile();

    if (channel === 'twitter') {
      const url = buildTwitterIntent(payload);
      openInNewTab(url);
      return;
    }
    if (channel === 'email') {
      const url = buildEmailIntent(payload);
      navigateSameTab(url); // mailto aynı tab
      return;
    }
    if (channel === 'copy') {
      try {
        const text = buildCopyText(payload);
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {/* noop */}
      return;
    }
    if (channel === 'telegram') {
      if (mobile) {
        const candidates = APP_LINKS.telegram(payload);
        tryOpenCandidates(candidates);
      } else {
        openInNewTab(buildTelegramWeb(payload));
      }
      return;
    }
    if (channel === 'whatsapp') {
      if (mobile) {
        const candidates = APP_LINKS.whatsapp(payload);
        tryOpenCandidates(candidates);
      } else {
        openInNewTab(buildWhatsAppWeb(payload));
      }
      return;
    }
    if (channel === 'instagram') {
      const candidates = APP_LINKS.instagram(payload);
      tryOpenCandidates(candidates);
      return;
    }
    if (channel === 'tiktok') {
      const candidates = APP_LINKS.tiktok(payload);
      tryOpenCandidates(candidates);
      return;
    }
  }, [payload]);

  // Aday deeplink -> web fallback denemesi (ilk çalışan kazanır)
  const tryOpenCandidates = (urls: string[]) => {
    // popup yerine tek tek dene (mobilde kullanıcı etkileşimi varken sorun olmuyor)
    for (const u of urls) {
      try {
        // App linkleri aynı tab’da denemek daha stabil
        if (u.startsWith('http')) openInNewTab(u);
        else window.location.href = u;
        break; // ilk denemeden sonra çık
      } catch {
        /* sonraki adaya geç */
      }
    }
  };

  // Puan kaydı (kanal, context, txId)
  const recordShare = useCallback(async (channel: Channel) => {
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
  }, [walletBase58, context, txId]);

  const onShare = useCallback(async (channel: Channel) => {
    openChannel(channel);
    await recordShare(channel);
    // modalı, copy harici kanallarda hemen kapat (copy için kısa “copied” feedback gösterdikten sonra kapanabilir)
    if (channel !== 'copy') onOpenChange(false);
  }, [openChannel, recordShare, onOpenChange]);

  if (!open) return null;

  // Tema rengi
  const headerColor = useMemo(() => {
    switch (theme) {
      case 'success': return 'from-green-500/20 to-emerald-500/10';
      case 'leaderboard': return 'from-blue-500/20 to-indigo-500/10';
      case 'profile': return 'from-pink-500/20 to-rose-500/10';
      default: return 'from-purple-500/20 to-fuchsia-500/10';
    }
  }, [theme]);

  // Teşvik cümlesi
  const nudge = useMemo(() => {
    switch (context) {
      case 'contribution': return 'Your revival matters. Share it and inspire the next Coincarnator!';
      case 'leaderboard':  return 'Flex your rank—one share could push you up the board.';
      case 'success':      return 'That was huge. Let the world know what you’ve revived.';
      case 'profile':
      default:             return 'Invite your circle—your CorePoint grows with every ripple.';
    }
  }, [context]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      <div className={`relative z-10 w-[92%] max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-white shadow-xl`}>
        <div className={`mb-4 rounded-xl border border-white/10 bg-gradient-to-r ${headerColor} p-3`}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Share</h3>
            <button className="rounded-md px-2 py-1 text-sm hover:bg-zinc-800" onClick={() => onOpenChange(false)}>
              ✕
            </button>
          </div>
          <p className="mt-2 text-[13px] text-zinc-200">{nudge}</p>
        </div>

        {/* Metin önizleme */}
        <div className="mb-4 rounded-lg bg-zinc-800/60 p-3 text-xs text-zinc-300 break-words">
          {payload.text}
        </div>

        {/* Kanallar */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => onShare('twitter')}  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700">X / Twitter</button>
          <button onClick={() => onShare('telegram')} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-700">Telegram</button>
          <button onClick={() => onShare('whatsapp')} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-700">WhatsApp</button>
          <button onClick={() => onShare('email')}    className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-semibold hover:bg-zinc-600">Email</button>
          <button onClick={() => onShare('instagram')}className="rounded-lg bg-pink-600 px-3 py-2 text-sm font-semibold hover:bg-pink-700">Instagram</button>
          <button onClick={() => onShare('tiktok')}   className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-700">TikTok</button>
          <button onClick={() => onShare('copy')}     className="col-span-3 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold hover:bg-amber-700">Copy text</button>
        </div>

        {copied && (
          <p className="mt-3 text-center text-[12px] text-green-400">✅ Copied. Paste anywhere you like!</p>
        )}
      </div>
    </div>
  );
}
