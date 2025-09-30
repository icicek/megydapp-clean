// components/wallet/ConnectBar.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import ConnectModal from '@/components/wallet/ConnectModal';
import WalletBrandIcon, { Brand } from '@/components/wallet/WalletBrandIcon';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const toBrand = (name?: string): Brand | undefined => {
  if (!name) return undefined;
  const n = norm(name);
  if (n.includes('phantom')) return 'phantom';
  if (n.includes('solflare')) return 'solflare';
  if (n.includes('backpack')) return 'backpack';
  if (n.includes('walletconnect')) return 'walletconnect';
  return undefined;
};

export default function ConnectBar() {
  const { connected, publicKey, disconnect, wallet } = useWallet();

  const [openModal, setOpenModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const shortAddr = useMemo(() => {
    const a = publicKey?.toBase58();
    return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
  }, [publicKey]);

  const brand = useMemo<Brand | undefined>(() => toBrand(wallet?.adapter?.name), [wallet?.adapter?.name]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  function openExplorer() {
    if (!publicKey) return;
    const url = `https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=mainnet`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="relative flex items-center justify-end w-full">
      {!connected ? (
        <button
          onClick={() => setOpenModal(true)}
          className="rounded-xl px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm md:text-base shadow"
        >
          Connect wallet
        </button>
      ) : (
        <>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="relative flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm shadow"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {/* soft glow */}
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-0.5 rounded-2xl blur opacity-30"
                style={{ background: 'radial-gradient(60% 60% at 30% 20%, rgba(80,200,120,.35), rgba(0,0,0,0))' }}
              />
              <span className="relative flex items-center gap-2">
                {brand && <WalletBrandIcon brand={brand} className="h-4 w-4" />}
                <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full border border-white/15 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20">
                  SOL
                </span>
                <span className="font-mono">{shortAddr}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition ${menuOpen ? 'rotate-180' : ''}`}>
                  <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
            </button>

            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur p-2 shadow-2xl z-50">
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); navigator.clipboard.writeText(publicKey!.toBase58()).catch(()=>{}); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  Copy address
                </button>

                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); requestAnimationFrame(() => setOpenModal(true)); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  Change wallet
                </button>

                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); openExplorer(); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  View on Explorer
                </button>

                <button
                  role="menuitem"
                  onClick={async () => { setMenuOpen(false); try { await disconnect(); } catch {} }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-red-300"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <ConnectModal open={openModal} onClose={() => setOpenModal(false)} />
    </div>
  );
}
