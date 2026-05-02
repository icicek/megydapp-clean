'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';

export default function SiteFooter() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const pubkeyBase58 = publicKey?.toBase58() ?? null;

  function shareOnX() {
    const text =
      'People are starting to Coincarnate deadcoins into something much bigger.';

    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `${text}\n\nhttps://coincarnation.com`
    )}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <footer className="w-full max-w-5xl border-t border-white/10 pt-6 pb-4">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:items-start">
        <div className="md:mx-auto md:max-w-[280px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
            Coincarnation
          </p>

          <p className="mt-3 text-sm leading-7 text-gray-400">
            Coincarnation is a creative initial offering event developed by Levershare
            to transform crypto market fragmentation into a Proof of Value economy.
          </p>
        </div>

        <div className="md:mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
            Navigate
          </p>

          <div className="mt-3 flex flex-col gap-2 text-sm">
            <a
              href="/coinographia"
              className="text-cyan-200 transition-colors hover:text-cyan-100"
            >
              Explore Coinographia
            </a>

            <button
              onClick={() => {
                if (!connected || !pubkeyBase58) {
                  alert('Connect your wallet to view your Coincarnation profile.');
                  return;
                }

                router.push('/profile');
              }}
              className="text-left text-emerald-200 transition-colors hover:text-emerald-100"
            >
              Open Your Profile
            </button>

            <a
              href="/docs"
              className="text-violet-200 transition-colors hover:text-violet-100"
            >
              Read the Docs
            </a>
          </div>
        </div>

        <div className="md:mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
            Social
          </p>

          <div className="mt-3 flex flex-col gap-3 text-sm">
            <button
              type="button"
              onClick={shareOnX}
              className="inline-flex items-center gap-2 text-left text-pink-200 transition-colors hover:text-pink-100"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-pink-300/20 bg-pink-400/[0.07] text-xs font-black">
                𝕏
              </span>
              <span>Share on X</span>
            </button>

            <a
              href="https://x.com/levershare"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-300 transition-colors hover:text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/[0.07] text-xs font-black">
                𝕏
              </span>
              <span>Follow on X</span>
            </a>

            <a
              href="https://t.me/levershare"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-300 transition-colors hover:text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-sky-300/20 bg-sky-400/[0.07] text-xs font-black">
                ✈
              </span>
              <span>Telegram</span>
            </a>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-white/8 pt-4 text-center">
        <p className="text-xs leading-5 text-gray-500">
          Every human being should have the right to build a personal currency
          powered by the value they contribute to the world.
        </p>
      </div>
    </footer>
  );
}