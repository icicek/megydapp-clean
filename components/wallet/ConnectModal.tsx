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

/* ---------------- Error Boundary (modal içi) ---------------- */
class ModalErrorBoundary extends React.Component<{ children: React.ReactNode }, { err?: any }> {
  constructor(p: any){ super(p); this.state = { err: undefined }; }
  static getDerivedStateFromError(err: any){ return { err }; }
  componentDidCatch(err:any, info:any){ console.error('[ConnectModal crash]', err, info); }
  render(){
    if (this.state.err){
      const msg = (this.state.err?.message || String(this.state.err)).slice(0, 400);
      return (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
          <div className="font-semibold mb-1">Wallet UI failed to render</div>
          <div className="opacity-80 whitespace-pre-wrap">{msg}</div>
          <div className="mt-2 text-xs opacity-70">Press Esc or click ✕ to close.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Yerel Brand & Rozet ---------------- */
type WalletBrand = 'phantom' | 'solflare' | 'backpack' | 'walletconnect';

function BrandBadge({
  brand, size = 24, className = '',
}: { brand: WalletBrand; size?: number; className?: string }) {
  const color =
    brand === 'phantom' ? '#8b5cf6' :
    brand === 'solflare' ? '#f97316' :
    brand === 'backpack' ? '#ef4444' :
    '#60a5fa';
  const letter = brand === 'phantom' ? 'P' : brand === 'solflare' ? 'S' : brand === 'backpack' ? 'B' : 'W';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-[12px] font-bold text-black/80 ${className}`}
      style={{ width: size, height: size, background: color, boxShadow: 'inset 0 0 14px rgba(0,0,0,.15)' }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

/* ---------------- Tipler/İçerik ---------------- */
type Props = { open: boolean; onClose: () => void };
type Card = { key: WalletBrand; label: string; note?: string; desc: string; installed: boolean; adapterName?: string };

const UI: ReadonlyArray<Pick<Card, 'key' | 'label' | 'note' | 'desc'>> = [
  { key: 'phantom',  label: 'Phantom',  desc: 'Popular & beginner-friendly' },
  { key: 'solflare', label: 'Solflare', desc: 'Ledger support, in-app staking' },
  { key: 'backpack', label: 'Backpack', desc: 'xNFTs & power-user features' },
  { key: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile', desc: 'Use mobile wallets via QR' },
];

const INSTALL_URL: Record<'phantom'|'solflare'|'backpack', string> = {
  phantom:  'https://phantom.app/download',
  solflare: 'https://solflare.com/download',
  backpack: 'https://www.backpack.app/download',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const LAST_KEY = 'cc:lastWalletBrand';

// link tıklarında kartın click’ini tetiklememek için:
const stopPropagationOnMouseDown: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
  e.stopPropagation();
};

export default function ConnectModal({ open, onClose }: Props) {
  const api = useWallet();
  const wallets = api.wallets ?? [];
  const { select, disconnect } = api;

  const [err, setErr]         = useState<string | null>(null);
  const [clicked, setClicked] = useState<WalletBrand | null>(null);
  const [busy, setBusy]       = useState(false);
  const [last, setLast]       = useState<WalletBrand | null>(null);

  useEffect(() => { if (open) console.log('[ConnectModal] open'); }, [open]);
  useEffect(() => { if (open) setLast((localStorage.getItem(LAST_KEY) as WalletBrand) || null); }, [open]);
  useEffect(() => { if (open) { setErr(null); setClicked(null); setBusy(false); } }, [open]);

  const mapByBrand = useMemo(() => {
    const m = new Map<WalletBrand, { adapterName: string; installed: boolean }>();
    for (const w of wallets) {
      const name = w?.adapter?.name ?? '';
      if (!name) continue;
      const n  = norm(name);
      const rs = (w as any)?.readyState ?? (w?.adapter as any)?.readyState;
      const installed = rs === 'Installed' || rs === 'Loadable';
      if (n.includes('phantom'))       m.set('phantom',       { adapterName: name, installed });
      if (n.includes('solflare'))      m.set('solflare',      { adapterName: name, installed });
      if (n.includes('backpack'))      m.set('backpack',      { adapterName: name, installed });
      if (n.includes('walletconnect')) m.set('walletconnect', { adapterName: name, installed: true });
    }
    return m;
  }, [wallets]);

  const cards: Card[] = useMemo(() => {
    const arr: Card[] = UI.map(({ key, label, note, desc }) => {
      const hit = mapByBrand.get(key as WalletBrand);
      return { key: key as WalletBrand, label, note, desc, installed: !!hit?.installed, adapterName: hit?.adapterName };
    });
    if (last) arr.sort((a, b) => (a.key === last ? -1 : b.key === last ? 1 : 0));
    return arr;
  }, [mapByBrand, last]);

  async function handlePick(brand: WalletBrand) {
    if (busy) return;
    setErr(null); setClicked(brand); setBusy(true);
    const hit = mapByBrand.get(brand);

    // WalletConnect adapter yoksa:
    if (brand === 'walletconnect' && !hit?.adapterName) {
      setErr('WalletConnect is not configured.');
      setBusy(false); setClicked(null);
      return;
    }

    // Yüklü değilse mağaza sayfasına
    if ((brand === 'phantom' || brand === 'solflare' || brand === 'backpack') && (!hit?.adapterName || !hit.installed)) {
      window.open(INSTALL_URL[brand], '_blank', 'noopener,noreferrer');
      setBusy(false); setClicked(null);
      return;
    }

    try {
      await select(hit!.adapterName as WalletName);
      await api.connect();
      localStorage.setItem(LAST_KEY, brand);
      onClose();
    } catch (e: any) {
      setErr(e?.name + ' ' + (e?.message || 'Failed to connect.'));
      try { await disconnect(); } catch {}
      setBusy(false); setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Overlay: blur’ı kapatıyoruz */}
      <DialogOverlay className="z-[90] bg-black/60 backdrop-blur-0" />

      <DialogContent className="relative bg-zinc-900 text-white p-6 rounded-2xl w-[92vw] max-w-md max-h-[85vh] overflow-y-auto overscroll-contain z-[100] shadow-2xl border border-white/10">
        {/* Floating X */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-[130] inline-flex items-center justify-center
                     h-9 w-9 rounded-xl bg-black/30 backdrop-blur border border-white/15
                     hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 shadow-lg"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Basit başlık (sticky/negatif margin yok) */}
        <div className="mb-3">
          <DialogTitle className="text-white text-base font-semibold">
            Connect a Solana wallet
          </DialogTitle>
          <DialogDescription className="sr-only">Choose a wallet to connect to Coincarnation.</DialogDescription>
        </div>

        <ModalErrorBoundary>
          {/* Kartlar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {cards.map(({ key, label, note, desc, installed }: Card) => {
              const isBusy = busy && clicked === key;
              const badge =
                key === 'walletconnect' ? { text: 'QR',        cls: 'bg-indigo-600/30 border-indigo-500/50' } :
                installed              ? { text: 'Installed', cls: 'bg-emerald-600/30 border-emerald-500/50' } :
                                         { text: 'Install',   cls: 'bg-zinc-700/50   border-zinc-500/50' };

              return (
                <button
                  key={key}
                  onClick={() => handlePick(key)}
                  disabled={busy}
                  className="relative grid grid-rows-[auto_1fr_auto] h-[8.5rem]
                             rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.07]
                             pl-4 pr-14 pt-5 pb-3 overflow-hidden text-left"
                >
                  {/* badge */}
                  <span className={`absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>
                    {badge.text}
                  </span>

                  {/* başlık */}
                  <div className="relative z-10 flex items-center gap-2">
                    <BrandBadge brand={key} size={24} className="h-6 w-6 shrink-0" />
                    <span className="font-semibold">{label}</span>
                  </div>

                  {/* açıklama */}
                  <div
                    className="relative z-10 text-xs text-gray-300 mt-2 self-start"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {desc}{note ? ` — ${note}` : ''}
                  </div>

                  {/* alt link */}
                  {!installed && key !== 'walletconnect' && (
                    <a
                      href={INSTALL_URL[key as keyof typeof INSTALL_URL]}
                      target="_blank"
                      rel="noreferrer"
                      className="relative z-10 self-end text-[11px] text-gray-300 underline"
                      onMouseDown={stopPropagationOnMouseDown}
                    >
                      Not installed? Get {label}
                    </a>
                  )}

                  {/* busy */}
                  {isBusy && (
                    <div className="absolute right-2 bottom-2 z-10 text-[11px] text-gray-400 flex items-center gap-2">
                      <span className="inline-block h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Connecting…
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Need a wallet? */}
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-sm font-semibold mb-2">Need a wallet?</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] text-gray-300">
              <div className="rounded-lg p-3 bg-black/20 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <BrandBadge brand="phantom" size={18} />
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
                  <BrandBadge brand="solflare" size={18} />
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
        </ModalErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
