// components/share/ShareCenter.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SharePayload, Channel } from '@/components/share/intent';
import {
  buildCopyText,
  buildTwitterIntent,
  buildTelegramWeb,
  buildWhatsAppWeb,
  buildEmailIntent,
  getShareSlogan,
} from '@/components/share/intent';
import { detectInAppBrowser } from '@/components/share/browser';

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

  const widthClass = wide
    ? 'w-[min(720px,calc(100vw-2rem))]'
    : 'w-auto max-w-[90vw]';

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
  payload: SharePayload | null;
  context: 'profile' | 'contribution' | 'leaderboard' | 'success';
  txId?: string;
  walletBase58?: string | null;
  anchor?: string;
};

export default function ShareCenter({
  open,
  onOpenChange,
  payload,
  context,
  txId,
  walletBase58,
  anchor,
}: Props) {
  if (!open || !payload) return null;
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastPos, setToastPos] = useState<'top' | 'bottom'>('bottom');
  const [toastWide, setToastWide] = useState<boolean>(true);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('info');
  const [shortUrl, setShortUrl] = useState<string | undefined>(payload?.shortUrl);
  const [copyReward, setCopyReward] = useState<number | null>(null);
  const [copyOpenModal, setCopyOpenModal] = useState(false);
  const [copiedPostText, setCopiedPostText] = useState('');

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
  
        // Esnek key isimleri (admin_config tarafında küçük isim farklarını tolere ediyoruz)
        const rawShareOther =
          cfg.shareOther ??
          cfg.share_other ??
          cfg.cp_share_other ??
          10;
  
        const rawMultShare =
          cfg.mShare ??
          cfg.multShare ??
          cfg.cp_mult_share ??
          1;
  
        const shareOther = Number(rawShareOther);
        const mShare = Number(rawMultShare);
  
        const pts = Math.max(
          0,
          Math.floor(
            (Number.isFinite(shareOther) ? shareOther : 10) *
            (Number.isFinite(mShare) ? mShare : 1),
          ),
        );
  
        setCopyReward(pts);
      } catch (e) {
        // Sessiz fail → sadece log, UI bozulmasın
        console.warn('[ShareCenter] corepoints config fetch failed', e);
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
      anchor,
    };

    if (walletBase58) {
      body.wallet = walletBase58;
    }
    if (txId) {
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

  // import satırında useCallback'i kaldır:
  const openChannel = async (channel: Channel) => {
    const p = payloadWithShort;
  
    try {
      if (channel === 'twitter') {
        const composed = buildCopyText(p);
  
        console.log('[ShareCenter] twitter clicked', {
          context,
          txId,
          walletBase58,
          payload: p,
          walletBrowser: isWalletBrowser(),
        });
  
        // ✅ Wallet browsers: copy-only + mini modal
        if (isWalletBrowser()) {
          const copied = await copyTextSafe(composed);
  
          if (copied) {
            await sendShareEvent('copy');
            setCopiedPostText(composed);
            setCopyOpenModal(true);
            showToast('Post copied. Open X and paste.', 'top', false, 'success');
          } else {
            showToast('Could not auto-copy. Please copy manually and share on X.', 'top', true, 'error');
          }
  
          return;
        }
  
        // ✅ Real mobile browsers: native share
        if (isRealMobileBrowser() && typeof navigator !== 'undefined' && navigator.share) {
          try {
            await navigator.share({ text: composed });
            await sendShareEvent('twitter');
            onOpenChange(false);
            return;
          } catch {
            // fallback aşağıda
          }
        }
  
        // ✅ Desktop fallback: current behavior
        const intentUrl = buildTwitterIntent(p);
  
        if (typeof window !== 'undefined') {
          window.open(intentUrl, '_blank', 'noopener,noreferrer');
        }
  
        await sendShareEvent('twitter');
        onOpenChange(false);
        return;
      }
  
      showToast(
        "Direct sharing for this channel isn't live yet — use Copy text to share and earn CorePoints.",
        'bottom',
        true,
        'info',
      );
    } catch (e) {
      console.error('[ShareCenter] openChannel error', e);
      showToast('Could not open share channel.', 'top', false, 'error');
    }
  };

  // Copy text — X ile aynı birleşik format (intent.ts → buildCopyText)
  const handleCopy = async () => {
    try {
      const composed = buildCopyText(payloadWithShort);
      const copied = await copyTextSafe(composed);
  
      if (!copied) {
        showToast('Could not copy text.', 'top', false, 'error');
        return;
      }
  
      await sendShareEvent('copy');
      setCopiedPostText(composed);
  
      if (isWalletBrowser()) {
        setCopyOpenModal(true);
        showToast('Post copied. Open X and paste.', 'top', false, 'success');
      } else {
        showToast(
          'Post text copied — share manually to earn CorePoints!',
          'top',
          false,
          'success',
        );
      }
    } catch (e) {
      console.error('[ShareCenter] copy failed', e);
      showToast('Could not copy text.', 'top', false, 'error');
    }
  };

  function isWalletBrowser() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  
    const ua = navigator.userAgent.toLowerCase();
    const w = window as any;
  
    const isCoarsePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
  
    const isPhantom = ua.includes('phantom');
    const isBackpack = ua.includes('backpack');
  
    const isSolflareProvider =
      Boolean(w.solflare) ||
      Boolean(w.solana?.isSolflare) ||
      Boolean(w.solana?.isSolflareWallet);
  
    const isLikelySolflare =
      ua.includes('solflare') ||
      (isCoarsePointer && isSolflareProvider);
  
    return isPhantom || isBackpack || isLikelySolflare;
  }
  
  function isRealMobileBrowser() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches &&
      !isWalletBrowser()
    );
  }
  
  async function copyTextSafe(text: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
  
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
  
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
  
      return ok;
    } catch {
      return false;
    }
  }
  
  function openXHome() {
    if (typeof window === 'undefined') return;
  
    const text = copiedPostText || '';
    const encodedText = encodeURIComponent(text);
  
    const appUrl = `twitter://post?message=${encodedText}`;
    const webUrl = `https://x.com/compose/post?text=${encodedText}`;
  
    window.location.href = appUrl;
  
    window.setTimeout(() => {
      window.location.href = webUrl;
    }, 1200);
  
    setCopyOpenModal(false);
  }

  const heading = 'Share';

  // Üstte, Share başlığının hemen altında görünen sabit satır
  const staticSub =
    'Share your Coincarnation story — one post can change someone’s path.';

  // Gri kutunun içindeki context’e göre değişen kısa metin
  const previewText = getShareSlogan(context);

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

          <p className="mb-4 text-sm text-zinc-300">
            {staticSub}
          </p>

          {previewText && (
            <div
              className="mb-4 break-words whitespace-pre-wrap rounded-xl
                        border border-white/10 bg-zinc-800/70 p-3
                        text-xs text-zinc-200"
            >
              {previewText}
            </div>
          )}

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

      {copyOpenModal && (
        <div className="fixed inset-0 z-[30000] pointer-events-auto flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[360px] rounded-2xl border border-cyan-400/20 bg-zinc-950 p-5 text-white shadow-[0_0_32px_rgba(34,211,238,0.18)]">
            <h4 className="text-lg font-bold text-cyan-200">
              Post copied
            </h4>

            <p className="mt-2 text-sm text-zinc-300">
              Open X and paste to share.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-zinc-400 line-clamp-4">
              {copiedPostText}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={openXHome}
                className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-3 py-2 text-sm font-bold text-black transition hover:brightness-110 active:scale-95"
              >
                Open X
              </button>

              <button
                type="button"
                onClick={() => setCopyOpenModal(false)}
                className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
