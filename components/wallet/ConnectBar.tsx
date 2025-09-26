'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import ConnectModal from '@/components/wallet/ConnectModal';

export default function ConnectBar() {
  const { connected, publicKey, disconnect } = useWallet();

  const [openModal, setOpenModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const shortAddr = useMemo(() => {
    const a = publicKey?.toBase58();
    return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
  }, [publicKey]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  async function handleCopy() {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      const el = document.getElementById('cc-copy-toast');
      if (el) {
        el.classList.remove('opacity-0');
        setTimeout(() => el.classList.add('opacity-0'), 1200);
      }
    } catch {}
  }

  return (
    <div className="relative flex items-center justify-end w-full">
      {!connected ? (
        <>
          <button
            onClick={() => setOpenModal(true)}
            className="rounded-xl px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm md:text-base shadow"
          >
            Connect wallet
          </button>
        </>
      ) : (
        <>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm shadow"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="hidden sm:inline text-xs opacity-80">SOL</span>
              <span className="font-mono">{shortAddr}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition ${menuOpen ? 'rotate-180' : ''}`}>
                <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur p-2 shadow-2xl z-50"
              >
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); handleCopy(); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  Copy address
                </button>

                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    // dropdown tamamen kapansın → sonraki frame'de modalı aç
                    requestAnimationFrame(() => setOpenModal(true));
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  Change wallet
                </button>

                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setTimeout(() => disconnect().catch(() => {}), 0);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-red-300"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          <div
            id="cc-copy-toast"
            className="pointer-events-none absolute -bottom-8 right-0 text-xs bg-black/70 border border-white/10 rounded px-2 py-1 opacity-0 transition-opacity"
          >
            Copied
          </div>
        </>
      )}

      {/* Modal: DIŞARIDA tek instance */}
      <ConnectModal open={openModal} onClose={() => setOpenModal(false)} />
    </div>
  );
}
