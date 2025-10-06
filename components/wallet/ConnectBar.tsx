// components/wallet/ConnectBar.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import ConnectModal from '@/components/wallet/ConnectModal';
import WalletBrandBadge from '@/components/wallet/WalletBrandBadge';
import type { Brand } from '@/components/wallet/WalletBrandIcon';

const LAST_KEY = 'cc:lastWalletBrand';

function toBrand(name?: string | null): Brand | undefined {
  const n = (name || '').toLowerCase();
  if (!n) return undefined;
  if (n.includes('phantom')) return 'phantom';
  if (n.includes('solflare')) return 'solflare';
  if (n.includes('backpack')) return 'backpack';
  if (n.includes('walletconnect')) return 'walletconnect';
  return undefined;
}

export default function ConnectBar() {
  const { connected, publicKey, wallet, disconnect } = useWallet();

  const [openModal, setOpenModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // brand: adapter → yoksa last fallback
  const [lastBrand, setLastBrand] = useState<Brand | undefined>(undefined);
  useEffect(() => {
    try { setLastBrand((localStorage.getItem(LAST_KEY) as Brand | null) || undefined); } catch {}
  }, []);
  useEffect(() => {
    const b = toBrand(wallet?.adapter?.name);
    if (b) {
      try { localStorage.setItem(LAST_KEY, b); } catch {}
      setLastBrand(b);
    }
  }, [wallet?.adapter?.name]);

  const brand = useMemo<Brand | undefined>(() => toBrand(wallet?.adapter?.name) || lastBrand, [wallet?.adapter?.name, lastBrand]);

  const shortAddr = useMemo(() => {
    const a = publicKey?.toBase58();
    return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
  }, [publicKey]);

  // dışarı tıkla → menüyü kapat
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) setMenuOpen(false);
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

  function explorerUrl() {
    const a = publicKey?.toBase58();
    if (!a) return '#';
    // mainnet için solscan
    return `https://solscan.io/address/${a}`;
  }

  return (
    <div className="relative flex items-center justify-end w-full">
      {!connected ? (
        <button
          onClick={() => setOpenModal(true)}
          className="rounded-2xl px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm md:text-base shadow"
        >
          Connect wallet
        </button>
      ) : (
        <>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="relative flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm shadow overflow-hidden"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {/* parıltı arkada */}
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-0.5 rounded-2xl blur opacity-30 z-0"
                style={{ background: 'radial-gradient(60% 60% at 30% 20%, rgba(80,200,120,.35), rgba(0,0,0,0))' }}
              />
              {/* içerik üstte */}
              <span className="relative z-10 flex items-center gap-2">
                {brand && <WalletBrandBadge brand={brand} size={16} className="h-4 w-4" />}
                <span className="inline text-[10px] px-1.5 py-0.5 rounded-full border border-white/15 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20">
                  SOL
                </span>
                <span className="font-mono">{shortAddr}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition ${menuOpen ? 'rotate-180' : ''}`}>
                  <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur p-2 shadow-2xl z-50"
              >
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); handleCopy(); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  Copy address
                </button>

                <a
                  role="menuitem"
                  href={explorerUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                  onClick={() => setMenuOpen(false)}
                >
                  View on Explorer
                </a>

                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    requestAnimationFrame(() => setOpenModal(true));
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  Change wallet
                </button>

                <button
                  role="menuitem"
                  onClick={async () => {
                    setMenuOpen(false);
                    try { await disconnect(); } catch {}
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

      {/* Tek instancelı modal */}
      <ConnectModal open={openModal} onClose={() => setOpenModal(false)} />
    </div>
  );
}
