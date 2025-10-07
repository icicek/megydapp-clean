// components/wallet/ConnectBar.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import ConnectModal from '@/components/wallet/ConnectModal';
import WalletBrandBadge from '@/components/wallet/WalletBrandBadge';
import type { Brand } from '@/components/wallet/WalletBrandIcon';

type Props = {
  /** Mobil/hero altında daha kısa görünüm için */
  size?: 'sm' | 'md';
  className?: string;
};

const LAST_KEY = 'cc:lastWalletBrand';

function toBrand(name?: string | null): Brand | undefined {
  const n = (name || '').toLowerCase();
  if (!n) return undefined;
  if (n.includes('phantom')) return 'phantom';
  if (n.includes('solflare')) return 'solflare';
  if (n.includes('backpack')) return 'backpack';
  // Mobile adapter / WalletConnect ailesi
  if (
    n.includes('walletconnect') ||
    n.includes('mobile wallet adapter') ||
    n.includes('solana mobile') ||
    n.includes('mwa')
  ) {
    return 'walletconnect';
  }
  return undefined;
}

/** Küçük SOL chip — logo + “SOL” etiketi */
function SolanaChip({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full border border-white/15 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 shrink-0">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <defs>
          <linearGradient id="solg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00FFA3" />
            <stop offset="100%" stopColor="#DC1FFF" />
          </linearGradient>
        </defs>
        <path d="M6 7h14l-3 3H3l3-3Z" fill="url(#solg)" />
        <path d="M6 10.5h14l-3 3H3l3-3Z" fill="url(#solg)" opacity="0.85" />
        <path d="M6 14h14l-3 3H3l3-3Z" fill="url(#solg)" />
      </svg>
      <span className="text-[10px] font-semibold tracking-wide">SOL</span>
    </span>
  );
}

export default function ConnectBar({ size = 'md', className = '' }: Props) {
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
    return `https://solscan.io/address/${a}`;
  }

  // ——— görsel sınıflar ———
  const heightCls = size === 'sm' ? 'h-10 text-sm' : 'h-11 text-base';
  const padBtn    = size === 'sm' ? 'px-4' : 'px-5';
  const padPill   = size === 'sm' ? 'px-3' : 'px-4';

  // Adapter ikon fallback (brand çıkaramazsak yine logo göster)
  const adapterIcon: string | undefined = (wallet?.adapter as any)?.icon;

  return (
    <div className={`relative flex items-center w-auto ${className}`}>
      {!connected ? (
        // ——— Bağlı değilken: kompakt ve ışıltılı buton ———
        <button
          onClick={() => setOpenModal(true)}
          className={`group relative inline-flex items-center justify-center rounded-2xl ${heightCls} ${padBtn}
                      font-semibold text-white bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600
                      hover:from-indigo-500 hover:to-fuchsia-600
                      shadow-[0_8px_24px_rgba(99,102,241,0.35)] ring-1 ring-white/10
                      focus:outline-none focus:ring-2 focus:ring-indigo-400/40`}
          style={{ lineHeight: 1 }}
        >
          <span className="relative z-10">Connect wallet</span>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0) 100%)' }}
          />
        </button>
      ) : (
        // ——— Bağlıyken: zarif pill (logo + SOL + adres + chevron) ———
        <>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`relative flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10
                          ${padPill} ${heightCls} shadow`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {/* parıltı */}
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-0.5 rounded-2xl blur opacity-30 z-0"
                style={{ background: 'radial-gradient(60% 60% at 30% 20%, rgba(80,200,120,.35), rgba(0,0,0,0))' }}
              />

              {/* içerik: tek satır, sıkı */}
              <span className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap">
                {/* Marka rozeti — varsa enum ile, yoksa adapter.icon ile */}
                {brand ? (
                  <WalletBrandBadge brand={brand} size={16} className="h-4 w-4 shrink-0" />
                ) : adapterIcon ? (
                  <img src={adapterIcon} alt="" className="h-4 w-4 rounded-[4px] shrink-0" />
                ) : null}

                {/* SOL chip */}
                <SolanaChip size={14} />

                {/* Adres (taşmayı önlemek için limit + truncate) */}
                <span className="font-mono text-sm max-w-[7.5rem] truncate">{shortAddr}</span>

                {/* chevron */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition shrink-0 ${menuOpen ? 'rotate-180' : ''}`}>
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
