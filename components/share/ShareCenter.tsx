// components/share/ShareCenter.tsx
'use client';

import * as React from 'react';
import type { SharePayload, ShareMeta } from '@/components/share/intent';
import {
  buildTwitterIntent,
  buildTelegramWeb,
  buildWhatsAppWeb,
  buildEmailIntent,
  buildCopyText,
} from '@/components/share/intent';

// Basit toast (MEGY neon uyumlu)
function showToast(msg: string) {
  const id = 'share-toast';
  const old = document.getElementById(id);
  if (old) old.remove();

  const el = document.createElement('div');
  el.id = id;
  el.className =
    'fixed left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl text-white text-sm ' +
    'bg-gradient-to-r from-pink-600 to-fuchsia-500 shadow-2xl ' +
    'backdrop-blur supports-[backdrop-filter]:bg-white/10 border border-white/10 ' +
    'animate-fadeInOut';
  el.style.top = '18px';
  el.textContent = msg;
  document.body.appendChild(el);

  // animasyon CSS'i enjekte
  const styleId = 'share-toast-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, 8px); }
        12% { opacity: 1; transform: translate(-50%, 0); }
        88% { opacity: 1; }
        100% { opacity: 0; transform: translate(-50%, 8px); }
      }
      .animate-fadeInOut { animation: fadeInOut 3.2s ease-in-out forwards; }
    `;
    document.head.appendChild(style);
  }

  window.setTimeout(() => {
    el.remove();
  }, 3200);
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload; // buildPayload ile gelen
  context: 'success' | 'profile' | 'leaderboard' | 'contribution';
  txId?: string;
  walletBase58?: string | null;
  referralCode?: string; // varsa buradan gelir
};

export default function ShareCenter({
  open,
  onOpenChange,
  payload,
  context,
  txId,
  walletBase58,
  referralCode,
}: Props) {
  // meta: link üretiminde ref/src/ctx paramlarını tek yerden gönderelim
  const meta: ShareMeta = {
    ref: referralCode,
    src: 'app',
    ctx: context,
  };

  if (!open) return null;

  const close = () => onOpenChange(false);

  // X: aktif
  const onShareTwitter = () => {
    const url = buildTwitterIntent(payload, meta);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Diğerleri: toast + yönlendirme yok (şimdilik kapalı)
  const onShareDisabled = (platform: string) => {
    showToast(
      `“${platform}” share is coming soon. Use “Copy text” and share manually for +30 CorePoint.`
    );
  };

  // Kopyalama: metin + boş satır + TAM link + (tags/via)
  const onCopy = async () => {
    const text = buildCopyText(payload, meta);
    await navigator.clipboard.writeText(text);
    showToast('Copied! Paste it into your app. (+30 CorePoint)');
  };

  // Basit overlay/modal
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />
      {/* card */}
      <div className="relative z-10 w-[92%] max-w-md rounded-2xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Share</h3>
          <button
            onClick={close}
            className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {/* Buton grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* X — canlı gradient */}
          <button
            onClick={onShareTwitter}
            className="col-span-3 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition
                       bg-gradient-to-r from-[#0F172A] to-[#60A5FA]
                       hover:brightness-110 hover:scale-[1.01]"
          >
            <span className="text-lg">𝕏</span>
            <span>Share on X</span>
          </button>

          {/* Telegram (karartılmış, ama yazı net) */}
          <button
            onClick={() => onShareDisabled('Telegram')}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-white/90
                       bg-black/70 border border-white/10
                       [--glow:#229ED9] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                       bg-[linear-gradient(0deg,transparent,transparent),radial-gradient(120%_120%_at_50%_120%,color-mix(in_oklab,var(--glow),transparent_82%),transparent_60%)]
                       hover:brightness-105"
            title="Coming soon"
          >
            Telegram
          </button>

          {/* WhatsApp */}
          <button
            onClick={() => onShareDisabled('WhatsApp')}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-white/90
                       bg-black/70 border border-white/10
                       [--glow:#25D366] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                       bg-[linear-gradient(0deg,transparent,transparent),radial-gradient(120%_120%_at_50%_120%,color-mix(in_oklab,var(--glow),transparent_82%),transparent_60%)]
                       hover:brightness-105"
            title="Coming soon"
          >
            WhatsApp
          </button>

          {/* Instagram */}
          <button
            onClick={() => onShareDisabled('Instagram')}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-white/90
                       bg-black/70 border border-white/10
                       [--glow:#E1306C] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                       bg-[linear-gradient(0deg,transparent,transparent),radial-gradient(120%_120%_at_50%_120%,color-mix(in_oklab,var(--glow),transparent_82%),transparent_60%)]
                       hover:brightness-105"
            title="Coming soon"
          >
            Instagram
          </button>

          {/* TikTok */}
          <button
            onClick={() => onShareDisabled('TikTok')}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-white/90
                       bg-black/70 border border-white/10
                       [--glow:#000000] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                       bg-[linear-gradient(0deg,transparent,transparent),radial-gradient(120%_120%_at_50%_120%,color-mix(in_oklab,var(--glow),transparent_82%),transparent_60%)]
                       hover:brightness-105"
            title="Coming soon"
          >
            TikTok
          </button>

          {/* Email (kilitli) */}
          <button
            onClick={() => onShareDisabled('Email')}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-white/90
                       bg-black/70 border border-white/10
                       [--glow:#A78BFA] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                       bg-[linear-gradient(0deg,transparent,transparent),radial-gradient(120%_120%_at_50%_120%,color-mix(in_oklab,var(--glow),transparent_82%),transparent_60%)]
                       hover:brightness-105"
            title="Coming soon"
          >
            Email
          </button>
        </div>

        {/* Copy alanı */}
        <div className="mt-5 rounded-xl border border-white/10 bg-black/40 p-3">
          <button
            onClick={onCopy}
            className="w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
          >
            Copy text
          </button>
          <p className="mt-2 text-center text-xs text-white/60">
            Paste into any app to share. (+30 CorePoint)
          </p>
        </div>
      </div>
    </div>
  );
}
