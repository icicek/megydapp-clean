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

  useEffect(() => {
    if (connected && open) {
      setErr(null);
      setClicked(null);
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

  // Seçim context’e işleyene kadar bekle (max ~600ms), sonra connect et
  async function waitForSelection(expectedName: string, timeoutMs = 600) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      if (wallet?.adapter?.name === expectedName) return;
      // iki frame beklemek, React 19 commitlerini güvene alır
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    }
    // Süre dolsa da connect deneyeceğiz (bazı adapterler yine de hazır olabilir)
  }

  async function handleClick(brand: Brand) {
    setErr(null);
    setClicked(brand);
    try {
      const label = NAME_MAP[brand];
      const target = wallets.find((w) => w.adapter.name === label);
      if (!target) throw new Error(`${label} adapter not available`);

      // 1) Seç
      select(target.adapter.name as WalletName);

      // 2) Seçimin gerçekten context'e oturmasını bekle
      await waitForSelection(target.adapter.name);

      // 3) Bağlan (tek tıkta)
      await connect();
      // success → useEffect modalı kapatır
    } catch (e: any) {
      setErr(e?.message || String(e) || 'Failed to connect.');
      setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Eğer DialogOverlay export edilmiyorsa bu satırı silebilirsin */}
      <DialogOverlay className="z-[90]" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-[100] shadow-lg">
        <DialogTitle className="text-white">Connect a Solana wallet</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a wallet to connect to Coincarnation.
        </DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {BRANDS.map((b) => {
            const isBusy = connecting && clicked === b.id;
            const isInstalled = installed.has(NAME_MAP[b.id]);
            return (
              <button
                key={b.id}
                onClick={() => handleClick(b.id)}
                disabled={connecting}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-3 text-left transition disabled:opacity-60"
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
