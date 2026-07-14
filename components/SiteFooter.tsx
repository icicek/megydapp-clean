// components/SiteFooter.tsx

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';

export default function SiteFooter() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();

  const pubkeyBase58 = publicKey?.toBase58() ?? null;
  const currentYear = new Date().getFullYear();

  const [externalLinkNotice, setExternalLinkNotice] = useState<string | null>(
    null
  );

  const externalLinkNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (externalLinkNoticeTimerRef.current) {
        window.clearTimeout(externalLinkNoticeTimerRef.current);
        externalLinkNoticeTimerRef.current = null;
      }
    };
  }, []);

  function openProfile() {
    if (!connected || !pubkeyBase58) {
      alert('Connect your wallet to view your Coincarnation profile.');
      return;
    }

    router.push('/profile');
  }

  function isMobileDevice() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }

    const ua = navigator.userAgent.toLowerCase();

    const mobileUserAgent =
      /android|iphone|ipad|ipod|mobile|opera mini|iemobile/.test(ua);

    const coarsePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    return mobileUserAgent || coarsePointer;
  }

  function isMobileWalletBrowser() {
    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !isMobileDevice()
    ) {
      return false;
    }

    const ua = navigator.userAgent.toLowerCase();

    const w = window as typeof window & {
      phantom?: unknown;
      backpack?: unknown;
      solflare?: unknown;
      solana?: {
        isPhantom?: boolean;
        isBackpack?: boolean;
        isSolflare?: boolean;
        isSolflareWallet?: boolean;
      };
    };

    return Boolean(
      ua.includes('phantom') ||
      ua.includes('solflare') ||
      ua.includes('backpack') ||
      w.phantom ||
      w.backpack ||
      w.solflare ||
      w.solana?.isPhantom ||
      w.solana?.isBackpack ||
      w.solana?.isSolflare ||
      w.solana?.isSolflareWallet
    );
  }

  async function copyText(value: string) {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }

      const textarea = document.createElement('textarea');

      textarea.value = value;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const copied = document.execCommand('copy');

      document.body.removeChild(textarea);

      return copied;
    } catch {
      return false;
    }
  }

  function showExternalLinkNotice(message: string) {
    if (externalLinkNoticeTimerRef.current) {
      window.clearTimeout(externalLinkNoticeTimerRef.current);
      externalLinkNoticeTimerRef.current = null;
    }

    setExternalLinkNotice(message);

    externalLinkNoticeTimerRef.current = window.setTimeout(() => {
      setExternalLinkNotice(null);
      externalLinkNoticeTimerRef.current = null;
    }, 4200);
  }

  async function openExternalLinkSafely(
    url: string,
    platformName: string
  ) {
    if (typeof window === 'undefined') return;

    if (isMobileDevice()) {
      const copied = await copyText(url);

      showExternalLinkNotice(
        copied
          ? `${platformName} link copied. Open the ${platformName} app and paste it.`
          : `Copy this link and open it in the ${platformName} app: ${url}`
      );

      return;
    }

    // Desktop: open only once.
    // Do not inspect the return value when using noopener.
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function openTelegram() {
    if (typeof window === 'undefined') return;

    const username = 'levershare';
    const webUrl = `https://t.me/${username}`;
    const appUrl = `tg://resolve?domain=${username}`;

    // Desktop: Telegram'ın web bağlantısını yeni sekmede aç.
    if (!isMobileDevice()) {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Mobil wallet browser:
    // Özel tg:// protokolü hata verebildiği için güvenli şekilde kopyala.
    if (isMobileWalletBrowser()) {
      const copied = await copyText(webUrl);

      showExternalLinkNotice(
        copied
          ? 'Telegram link copied. Open Telegram and paste it.'
          : `Open this link in Telegram: ${webUrl}`
      );

      return;
    }

    // Normal mobil Chrome / Safari:
    // Telegram uygulamasını doğrudan çağır.
    window.location.href = appUrl;
  }

  async function shareOnX() {
    if (typeof window === 'undefined') return;

    const text =
      'People are starting to Coincarnate forgotten crypto assets into something much bigger.';

    const shareUrl = 'https://coincarnation.com';
    const fullText = `${text}\n\n${shareUrl}`;

    if (isMobileDevice()) {
      const copied = await copyText(fullText);

      showExternalLinkNotice(
        copied
          ? 'Post copied. Open X and paste it.'
          : 'Open X and share Coincarnation manually.'
      );

      return;
    }

    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      fullText
    )}`;

    // Desktop: open once; never redirect the Coincarnation tab.
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
  }

  const sectionTitleClass =
    'text-[10px] font-bold uppercase tracking-[0.22em] text-white/35';

  const linkClass =
    'cursor-pointer text-sm text-gray-400 transition-colors duration-200 hover:text-white';

  return (
    <>
      {externalLinkNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-[150] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-2xl border border-cyan-300/20 bg-[#07111f]/95 px-4 py-3 text-center text-sm font-semibold leading-6 text-cyan-100 shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_28px_rgba(34,211,238,0.12)] backdrop-blur-xl"
        >
          {externalLinkNotice}
        </div>
      )}

      <footer className="relative mt-14 w-full max-w-5xl border-t border-white/10 px-2 pb-4 pt-8">
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />

        <div className="grid grid-cols-1 gap-9 sm:grid-cols-2 lg:grid-cols-[1.15fr_0.8fr_0.9fr_1fr] lg:items-start lg:gap-12">
          {/* Brand */}
          <div className="max-w-xs">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/75">
              Coincarnation
            </p>

            <h2 className="mt-3 max-w-[260px] text-base font-semibold leading-7 text-white/90">
              Transforming forgotten value into future opportunity.
            </h2>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-400/[0.055] px-3 py-1.5 text-[10px] font-semibold text-emerald-100/75">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.65)]" />
              Built on Proof of Value
            </div>
          </div>

          {/* Product */}
          <nav aria-label="Product" className="lg:justify-self-center">
            <p className={sectionTitleClass}>Product</p>

            <div className="mt-3 flex flex-col items-start gap-2">
              <a href="/" className={linkClass}>
                Home
              </a>

              <a
                href="/coinographia"
                className="text-sm text-cyan-200/75 transition-colors duration-200 hover:text-cyan-100"
              >
                Coinographia
              </a>

              <button
                type="button"
                onClick={openProfile}
                className="cursor-pointer text-left text-sm text-emerald-200/75 transition-colors duration-200 hover:text-emerald-100"
              >
                Your Profile
              </button>
            </div>
          </nav>

          {/* Documentation */}
          <nav aria-label="Documentation" className="lg:justify-self-center">
            <p className={sectionTitleClass}>Documentation</p>

            <div className="mt-3 flex flex-col items-start gap-2">
              <a
                href="/docs"
                className="text-sm text-violet-200/75 transition-colors duration-200 hover:text-violet-100"
              >
                Whitepaper
              </a>

              <a href="/essays" className={linkClass}>
                Essays
              </a>

              <a href="/lexicon" className={linkClass}>
                Lexicon
              </a>
            </div>
          </nav>

          {/* Community */}
          <nav aria-label="Community">
            <p className={sectionTitleClass}>Community</p>

            <div className="mt-3 flex flex-col items-start gap-2">
              <button
                type="button"
                onClick={() =>
                  void openExternalLinkSafely(
                    'https://twitter.com/levershare',
                    'X'
                  )
                }
                className="group inline-flex min-h-7 cursor-pointer items-center gap-2 text-left text-sm text-gray-400 transition-colors duration-200 hover:text-white"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[11px] font-black transition-colors group-hover:border-cyan-300/20 group-hover:bg-cyan-400/[0.07]">
                  𝕏
                </span>

                <span>Follow on X</span>
              </button>

              <button
                type="button"
                onClick={() => void openTelegram()}
                className="group inline-flex min-h-7 cursor-pointer items-center gap-2 text-left text-sm text-gray-400 transition-colors duration-200 hover:text-white"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[11px] font-black transition-colors group-hover:border-sky-300/20 group-hover:bg-sky-400/[0.07]">
                  ✈
                </span>

                <span>Telegram</span>
              </button>

              <button
                type="button"
                onClick={() => void shareOnX()}
                className="group inline-flex min-h-7 cursor-pointer items-center gap-2 text-left text-sm text-pink-200/75 transition-colors duration-200 hover:text-pink-100"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-pink-300/15 bg-pink-400/[0.055] text-[11px] font-black transition-colors group-hover:border-pink-300/30 group-hover:bg-pink-400/[0.10]">
                  ↗
                </span>

                <span>Share Coincarnation</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 border-t border-white/[0.07] pt-5">
          <div className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-gray-500">
              © {currentYear} Coincarnation. All rights reserved.
            </p>

            <p className="text-xs text-gray-500">
              Built on the{' '}
              <span className="font-semibold text-violet-200/65">
                Levershare
              </span>{' '}
              philosophy.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}