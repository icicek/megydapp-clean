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
  const twoFrames = () =>
    new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r()))
    );

  async function waitForSelection(expectedName: string, timeoutMs = 1500) {
    const start = performance.now();
    // hızlı yol: zaten seçiliyse çık
    if (wallet?.adapter?.name === expectedName) return;
    // React 19 commit + adapter binding için birkaç deneme
    while (performance.now() - start < timeoutMs) {
      await twoFrames();
      if (wallet?.adapter?.name === expectedName) return;
      await sleep(20);
    }
    // Süre doldu; yine de connect deneyeceğiz (bazı adapterlar yetişebiliyor)
  }

  function isNotSelectedError(e: any) {
    const name = e?.name || '';
    const msg = String(e?.message || e || '');
    return name === 'WalletNotSelectedError' || msg.includes('WalletNotSelectedError');
  }
  function isUserRejected(e: any) {
    const name = e?.name || '';
    const msg = String(e?.message || e || '');
    return /UserRejected|UserRejectedRequest/i.test(name + ' ' + msg);
  }
  function isWindowClosed(e: any) {
    const name = e?.name || '';
    const msg = String(e?.message || e || '');
    return /WindowClosed|PopupClosed/i.test(name + ' ' + msg);
  }

  async function connectRobust(label: string) {
    const target = wallets.find((w) => w.adapter.name === label);
    if (!target) throw new Error(`${label} adapter not available`);

    // 1) Seç
    select(target.adapter.name as WalletName);

    // 2) Seçimin gerçekten context'e yazılmasını bekle
    await waitForSelection(target.adapter.name, 1800);

    // 3) Artan aralıklı retry ile bağlan
    const ATTEMPTS = 10;               // ~10 deneme
    const BASE = 80;                   // 80ms başlangıç bekleme
    for (let i = 0; i < ATTEMPTS; i++) {
      try {
        await connect();
        return; // success
      } catch (e: any) {
        if (isUserRejected(e)) {
          throw new Error('Request was rejected.');
        }
        if (isWindowClosed(e)) {
          throw new Error('Wallet window was closed.');
        }
        if (isNotSelectedError(e)) {
          // seçimin propagasyonu gecikti → bekle ve dene
          await sleep(BASE * (i + 1)); // 80,160,240,... ~800ms
          continue;
        }
        // başka bir hata → dışarı
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
      await connectRobust(label);
      // success → useEffect kapatır
    } catch (e: any) {
      const msg =
        e?.message === 'Request was rejected.' ||
        e?.message === 'Wallet window was closed.'
          ? e.message
          : e?.message || String(e) || 'Failed to connect.';
      setErr(msg);
      setClicked(null);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Eğer DialogOverlay sende export edilmiyorsa bu satırı kaldır */}
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
