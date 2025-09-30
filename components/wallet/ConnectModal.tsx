// components/wallet/ConnectModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { connectStable } from '@/lib/solana/connectStable';
import WalletBrandIcon, { Brand } from '@/components/wallet/WalletBrandIcon';

type Props = { open: boolean; onClose: () => void };

type UIItem = { key: Brand; label: string; note?: string; desc: string };
type Card = { key: Brand; label: string; note?: string; desc: string; installed: boolean; adapterName?: string };

const UI: UIItem[] = [
  { key: 'phantom',  label: 'Phantom',      desc: 'Popular & beginner-friendly' },
  { key: 'solflare', label: 'Solflare',     desc: 'Ledger support, in-app staking' },
  { key: 'backpack', label: 'Backpack',     desc: 'xNFTs & power-user features' },
  { key: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile', desc: 'Use mobile wallets via QR' },
];

const INSTALL_URL: Record<Exclude<Brand,'walletconnect'>, string> = {
  phantom:  'https://phantom.app/download',
  solflare: 'https://solflare.com/download',
  backpack: 'https://www.backpack.app/download',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export default function ConnectModal({ open, onClose }: Props) {
  const api = useWallet();
  const { wallets, select, disconnect } = api;

  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setErr(null); setClicked(null); setBusy(false); } }, [open]);

  const mapByBrand = useMemo(() => {
    const m = new Map<Brand, { adapterName: string; installed: boolean }>();
    for (const w of wallets) {
      const n = norm(w.adapter.name);
      const rs = (w as any).readyState ?? (w.adapter as any).readyState;
      const installed = rs === 'Installed' || rs === 'Loadable';
      if (n.includes('phantom'))       m.set('phantom',       { adapterName: w.adapter.name, installed });
      if (n.includes('solflare'))      m.set('solflare',      { adapterName: w.adapter.name, installed });
      if (n.includes('backpack'))      m.set('backpack',      { adapterName: w.adapter.name, installed });
      if (n.includes('walletconnect')) m.set('walletconnect', { adapterName: w.adapter.name, installed: true });
    }
    return m;
  }, [wallets]);

  const cards = useMemo<Card[]>(
    () => UI.map(({ key, label, note, desc }) => {
      const hit = mapByBrand.get(key);
      return { key, label, note, desc, installed: !!hit?.installed, adapterName: hit?.adapterName };
    }),
    [mapByBrand]
  );

  async function handlePick(brand: Brand) {
    if (busy) return;
    setErr(null); setClicked(brand); setBusy(true);

    const hit = mapByBrand.get(brand);

    if (brand === 'walletconnect' && !hit?.adapterName) {
      setErr('WalletConnect is not configured. Please set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.');
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
      onClose(); // ✅ yalnız başarılı bağlantıdan sonra kapat
    } catch (e: any) {
      setErr(e?.message || String(e) || 'Failed to connect.');
      try { await disconnect(); } catch {}
      setBusy(false); setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogOverlay className="z-[90]" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-[100] shadow-2xl border border-white/10">
        <DialogTitle className="text-white">Connect a Solana wallet</DialogTitle>
        <DialogDescription className="sr-only">Choose a wallet to connect to Coincarnation.</DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {cards.map(({ key, label, note, desc, installed }) => {
            const isBusy = busy && clicked === key;
            return (
              <button
                key={key}
                onPointerDown={() => handlePick(key)}
                disabled={busy}
                className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 p-3 text-left transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <WalletBrandIcon brand={key} className="h-6 w-6" />
                    <span className="font-semibold">{label}</span>
                  </div>
                  {key === 'walletconnect' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/30 border border-indigo-500/50">QR</span>
                  ) : installed ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/30 border border-emerald-500/50">Installed</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 border border-zinc-600">Install</span>
                  )}
                </div>

                <div className="text-xs text-gray-300 mt-1">{desc}{note ? ` — ${note}` : ''}</div>
                {!installed && key !== 'walletconnect' && (
                  <div className="text-[11px] text-gray-400 mt-2">
                    Not installed? <span className="underline">Get {label}</span>
                  </div>
                )}

                {isBusy && (
                  <div className="mt-2 text-[11px] text-gray-400 flex items-center gap-2">
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
          <div className="grid grid-cols-2 gap-3 text-[12px] text-gray-300">
            <div className="rounded-lg p-3 bg-black/20 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <WalletBrandIcon brand="phantom" />
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
                <WalletBrandIcon brand="solflare" />
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
