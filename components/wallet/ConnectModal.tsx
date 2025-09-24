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

type Props = {
  open: boolean;
  onClose: () => void;
};

const NAME_MAP = {
  phantom: 'Phantom',
  solflare: 'Solflare',
  backpack: 'Backpack',
  walletconnect: 'WalletConnect',
} as const;
type Brand = keyof typeof NAME_MAP;

const BRANDS: { id: Brand; label: string; note?: string }[] = [
  { id: 'phantom', label: 'Phantom' },
  { id: 'solflare', label: 'Solflare' },
  { id: 'backpack', label: 'Backpack' },
  { id: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile' },
];

export default function ConnectModal({ open, onClose }: Props) {
  const { select, connect, connected, connecting, wallets, wallet } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (connected && open) {
      setErr(null);
      setClicked(null);
      setBusy(false);
      onClose();
    }
  }, [connected, open, onClose]);

  const installed = useMemo(() => {
    const map = new Set<string>();
    for (const w of wallets) {
      const rs = (w as any).readyState ?? (w.adapter as any).readyState;
      if (rs === 'Installed' || rs === 'Loadable') map.add(w.adapter.name);
    }
    return map;
  }, [wallets]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () =>
    new Promise<void>((r) => requestAnimationFrame(() => r()));

  // select -> commit bekle -> connect (WalletNotSelectedError için retry)
  async function connectWithRetry(label: string) {
    const target = wallets.find((w) => w.adapter.name === label);
    if (!target) throw new Error(`${label} adapter not available`);

    const adapterName = target.adapter.name as WalletName;

    // 1) Seç
    select(adapterName);

    // 2) React 19 commit + provider seçimi için kısa bekleme
    await Promise.resolve();      // microtask
    await nextFrame();            // 1 frame
    await sleep(10);              // küçük tampon

    // 3) Retry ile connect
    const MAX_ATTEMPTS = 6;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        await connect();
        return; // success
      } catch (e: any) {
        const name = e?.name || '';
        const msg = String(e?.message || e || '');
        const isNotSelected =
          name === 'WalletNotSelectedError' ||
          msg.includes('WalletNotSelectedError');

        if (isNotSelected) {
          // Provider henüz seçimi görmedi → bekle ve yeniden dene
          await sleep(100 + i * 100); // 100ms → 600ms arası artan bekleme
          continue;
        }
        // başka bir hata ise dışarı fırlat
        throw e;
      }
    }
    throw new Error('Connect timeout (please try again).');
  }

  async function handleClick(brand: Brand) {
    setErr(null);
    setClicked(brand);
    setBusy(true);
    try {
      const label = NAME_MAP[brand];
      await connectWithRetry(label);
      // başarı → useEffect modalı kapatır
    } catch (e: any) {
      setErr(e?.message || String(e) || 'Failed to connect.');
      setClicked(null);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Eğer DialogOverlay export edilmiyorsa bu satırı kaldırabilirsiniz */}
      <DialogOverlay className="z-[90]" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-[100] shadow-lg">
        <DialogTitle className="text-white">Connect a Solana wallet</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a wallet to connect to Coincarnation.
        </DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {BRANDS.map((b) => {
            const isBusy = (connecting || busy) && clicked === b.id;
            const isInstalled = installed.has(NAME_MAP[b.id]);
            return (
              <button
                key={b.id}
                onClick={() => handleClick(b.id)}
                disabled={connecting || busy}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-3 text-left transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{b.label}</span>
                  {isInstalled && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/30 border border-emerald-500/50">
                      Installed
                    </span>
                  )}
                </div>
                {b.note && <div className="text-xs text-gray-400 mt-1">{b.note}</div>}
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

        {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
      </DialogContent>
    </Dialog>
  );
}
