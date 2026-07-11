//components/SiteFooter.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';

export default function SiteFooter() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();

  const pubkeyBase58 = publicKey?.toBase58() ?? null;
  const currentYear = new Date().getFullYear();

  function openProfile() {
    if (!connected || !pubkeyBase58) {
      alert('Connect your wallet to view your Coincarnation profile.');
      return;
    }

    router.push('/profile');
  }

  function shareOnX() {
    const text =
      'People are starting to Coincarnate forgotten crypto assets into something much bigger.';

    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `${text}\n\nhttps://coincarnation.com`
    )}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const sectionTitleClass =
    'text-[10px] font-bold uppercase tracking-[0.22em] text-white/35';

  const linkClass =
    'text-sm text-gray-400 transition-colors duration-200 hover:text-white';

  return (
    <footer className="relative mt-14 w-full max-w-5xl border-t border-white/10 px-2 pb-5 pt-10">
      {/* Top glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />

      {/* Main footer */}
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_0.8fr_0.9fr_0.9fr]">
        {/* Brand */}
        <div className="max-w-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/75">
            Coincarnation
          </p>

          <h2 className="mt-4 max-w-xs text-xl font-black leading-snug text-white">
            Transforming forgotten value into future opportunity.
          </h2>

          <p className="mt-4 max-w-sm text-sm leading-7 text-gray-400">
            A Proof of Value ecosystem designed to give abandoned digital
            assets a second economic life.
          </p>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-400/[0.055] px-3 py-1.5 text-[10px] font-semibold text-emerald-100/75">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.65)]" />
            Built on Proof of Value
          </div>
        </div>

        {/* Product */}
        <nav aria-label="Product">
          <p className={sectionTitleClass}>Product</p>

          <div className="mt-4 flex flex-col items-start gap-3">
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
              className="text-left text-sm text-emerald-200/75 transition-colors duration-200 hover:text-emerald-100"
            >
              Your Profile
            </button>
          </div>
        </nav>

        {/* Documentation */}
        <nav aria-label="Documentation">
          <p className={sectionTitleClass}>Documentation</p>

          <div className="mt-4 flex flex-col items-start gap-3">
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

          <div className="mt-4 flex flex-col items-start gap-3">
            <a
              href="https://x.com/levershare"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 text-sm text-gray-400 transition-colors duration-200 hover:text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-xs font-black transition-colors group-hover:border-cyan-300/20 group-hover:bg-cyan-400/[0.07]">
                𝕏
              </span>

              <span>Follow on X</span>
            </a>

            <a
              href="https://t.me/levershare"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 text-sm text-gray-400 transition-colors duration-200 hover:text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-xs font-black transition-colors group-hover:border-sky-300/20 group-hover:bg-sky-400/[0.07]">
                ✈
              </span>

              <span>Telegram</span>
            </a>

            <button
              type="button"
              onClick={shareOnX}
              className="group inline-flex items-center gap-2 text-left text-sm text-pink-200/75 transition-colors duration-200 hover:text-pink-100"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-pink-300/15 bg-pink-400/[0.055] text-xs font-black transition-colors group-hover:border-pink-300/30 group-hover:bg-pink-400/[0.10]">
                ↗
              </span>

              <span>Share Coincarnation</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Bottom bar */}
      <div className="mt-10 border-t border-white/[0.07] pt-5">
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
  );
}