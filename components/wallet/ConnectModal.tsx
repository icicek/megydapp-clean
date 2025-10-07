// components/wallet/ConnectModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { motion } from 'framer-motion';

import WalletBrandBadge from '@/components/wallet/WalletBrandBadge';
import { Brand } from '@/components/wallet/WalletBrandIcon';
import { connectStable } from '@/lib/solana/connectStable';

type Props = { open: boolean; onClose: () => void };

type UIItem = { key: Brand; label: string; note?: string; desc: string };
type Card   = { key: Brand; label: string; note?: string; desc: string; installed: boolean; adapterName?: string };

const UI: UIItem[] = [
  { key: 'phantom',  label: 'Phantom',  desc: 'Popular & beginner-friendly' },
  { key: 'solflare', label: 'Solflare', desc: 'Ledger support, in-app staking' },
  { key: 'backpack', label: 'Backpack', desc: 'xNFTs & power-user features' },
  { key: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile', desc: 'Use mobile wallets via QR' },
];

const INSTALL_URL: Record<Exclude<Brand,'walletconnect'>, string> = {
  phantom:  'https://phantom.app/download',
  solflare: 'https://solflare.com/download',
  backpack: 'https://www.backpack.app/download',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const LAST_KEY = 'cc:lastWalletBrand';

export default function ConnectModal({ open, onClose }: Props) {
  const api = useWallet();
  const { wallets, select, disconnect } = api;

  const [err, setErr]           = useState<string | null>(null);
  const [clicked, setClicked]   = useState<Brand | null>(null);
  const [busy, setBusy]         = useState(false);
  const [last, setLast]         = useState<Brand | null>(null);

  useEffect(() => { if (open) setLast((localStorage.getItem(LAST_KEY) as Brand) || null); }, [open]);
  useEffect(() => { if (open) { setErr(null); setClicked(null); setBusy(false); } }, [open]);

  const mapByBrand = useMemo(() => {
    const m = new Map<Brand, { adapterName: string; installed: boolean }>();
    for (const w of wallets) {
      const n  = norm(w.adapter.name);
      const rs = (w as any).readyState ?? (w.adapter as any).readyState;
      const installed = rs === 'Installed' || rs === 'Loadable';
      if (n.includes('phantom'))       m.set('phantom',       { adapterName: w.adapter.name, installed });
      if (n.includes('solflare'))      m.set('solflare',      { adapterName: w.adapter.name, installed });
      if (n.includes('backpack'))      m.set('backpack',      { adapterName: w.adapter.name, installed });
      if (n.includes('walletconnect')) m.set('walletconnect', { adapterName: w.adapter.name, installed: true });
    }
    return m;
  }, [wallets]);

  const cards: Card[] = useMemo(() => {
    const arr = UI.map(({ key, label, note, desc }) => {
      const hit = mapByBrand.get(key);
      return { key, label, note, desc, installed: !!hit?.installed, adapterName: hit?.adapterName };
    });
    if (last) arr.sort((a, b) => (a.key === last ? -1 : b.key === last ? 1 : 0));
    return arr;
  }, [mapByBrand, last]);

  async function handlePick(brand: Brand) {
    if (busy) return;
    setErr(null); setClicked(brand); setBusy(true);

    const hit = mapByBrand.get(brand);

    if (brand === 'walletconnect' && !hit?.adapterName) {
      setErr('WalletConnect is not configured.');
      setBusy(false); setClicked(null);
      return;
    }

    if ((brand === 'phantom' || brand === 'solflare' || brand === 'backpack') && (!hit?.adapterName || !hit.installed)) {
      window.open(INSTALL_URL[brand], '_blank', 'noopener,noreferrer');
      setBusy(false); setClicked(null);
      return;
    }

    try {
      await select(hit!.adapterName as WalletName);
      await connectStable(hit!.adapterName!, api);
      localStorage.setItem(LAST_KEY, brand);
      onClose();
    } catch (e: any) {
      setErr(e?.message || String(e) || 'Failed to connect.');
      try { await disconnect(); } catch {}
      setBusy(false); setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogOverlay className="z-[90]" />

      <DialogContent className="bg-zinc-900 text-white p-6 rounded-2xl w-[92vw] max-w-md max-h-[85vh] overflow-y-auto overscroll-contain z-[100] shadow-2xl border border-white/10">

        {/* Sticky header: tam opak, alt çizgili; tıklamalar yalnızca butona geçer */}
        <div
          className="sticky top-0 -m-6 px-6 pt-3 pb-2 z-[120] flex items-center justify-between
                     pointer-events-none bg-zinc-900/95 backdrop-blur
                     border-b border-white/10"
        >
          <DialogTitle
            className="text-white/95 text-base font-semibold pointer-events-auto
                       drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
          >
            Connect a Solana wallet
          </DialogTitle>

          <button
            onClick={onClose}
            aria-label="Close"
            className="pointer-events-auto inline-flex items-center justify-center h-8 w-8
                       rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Header ile grid arası güvenli boşluk — kartların üstteki X’e “değmemesi” için */}
        <div className="h-3 sm:h-4" />

        <DialogDescription className="sr-only">Choose a wallet to connect to Coincarnation.</DialogDescription>

        {/* Mobil tek sütun, ≥640px iki sütun */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 touch-pan-y">
          {cards.map(({ key, label, note, desc, installed }) => {
            const isBusy = busy && clicked === key;
            const isLast = last === key;
            const badge =
              key === 'walletconnect' ? { text: 'QR',        cls: 'bg-indigo-600/30 border-indigo-500/50' } :
              installed              ? { text: 'Installed', cls: 'bg-emerald-600/30 border-emerald-500/50' } :
                                       { text: 'Install',   cls: 'bg-zinc-700/50   border-zinc-500/50' };

            return (
              <motion.button
                key={key}
                layout
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handlePick(key)}
                disabled={busy}
                className="relative grid grid-rows-[auto_1fr_auto] h-[8.5rem]
                           rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.07]
                           pl-4 pr-14 pt-5 pb-3 overflow-hidden outline-none focus:outline-none select-none"
              >
                {/* Son kullanılan için hafif ring */}
                {isLast && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-emerald-400/40"
                  />
                )}

                {/* Rozet: sağ-üst */}
                <span
                  className={`absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}
                >
                  {badge.text}
                </span>

                {/* 1) Başlık satırı */}
                <div className="relative z-10 flex items-center gap-2">
                  <WalletBrandBadge brand={key} size={24} className="h-6 w-6 shrink-0" />
                  <span className="font-semibold">{label}</span>
                </div>

                {/* 2) Açıklama */}
                <div
                  className="relative z-10 text-xs text-gray-300 mt-2 self-start"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {desc}{note ? ` — ${note}` : ''}
                </div>

                {/* 3) Alt link */}
                {!installed && key !== 'walletconnect' && (
                  <a
                    href={INSTALL_URL[key as keyof typeof INSTALL_URL]}
                    target="_blank"
                    rel="noreferrer"
                    className="relative z-10 self-end text-[11px] text-gray-300 underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Not installed? Get {label}
                  </a>
                )}

                {/* Busy göstergesi */}
                {isBusy && (
                  <div className="absolute right-2 bottom-2 z-10 text-[11px] text-gray-400 flex items-center gap-2">
                    <span className="inline-block h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Connecting…
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Need a wallet? */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-sm font-semibold mb-2">Need a wallet?</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] text-gray-300">
            <div className="rounded-lg p-3 bg-black/20 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <WalletBrandBadge brand="phantom" size={18} />
                <div className="font-medium">Phantom</div>
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Best for starters</li>
                <li>Great UX, mobile + desktop</li>
                <li>Auto-detect tokens/NFTs</li>
              </ul>
              <a href={INSTALL_URL.phantom} target="_blank" className="underline mt-2 inline-block">Install Phantom</a>
            </div>

            <div className="rounded-lg p-3 bg-black/20 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <WalletBrandBadge brand="solflare" size={18} />
                <div className="font-medium">Solflare</div>
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Ledger compatible</li>
                <li>Built-in staking</li>
                <li>Mobile + desktop</li>
              </ul>
              <a href={INSTALL_URL.solflare} target="_blank" className="underline mt-2 inline-block">Install Solflare</a>
            </div>
          </div>
        </div>

        {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
      </DialogContent>
    </Dialog>
  );
}
