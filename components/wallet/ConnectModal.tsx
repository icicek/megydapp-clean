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
import { flushSync } from 'react-dom';

type Props = { open: boolean; onClose: () => void };

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
  const { select, connect, disconnect, connected, connecting, wallets } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setErr(null); setClicked(null); setBusy(false); }
  }, [open]);

  useEffect(() => {
    if (connected && open) onClose();
  }, [connected, open, onClose]);

  const installed = useMemo(() => {
    const map = new Set<string>();
    for (const w of wallets) {
      const rs = (w as any).readyState ?? (w.adapter as any).readyState;
      if (rs === 'Installed' || rs === 'Loadable') map.add(w.adapter.name);
    }
    return map;
  }, [wallets]);

  const isNotSelected = (e: any) =>
    /WalletNotSelectedError/i.test(((e?.name || '') + ' ' + (e?.message || '')));

  const timeout = <T,>(p: Promise<T>, ms = 8000) =>
    Promise.race<T>([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('connect-timeout')), ms)),
    ]);

  async function handleClick(brand: Brand) {
    if (busy) return;
    setErr(null);
    setClicked(brand);
    setBusy(true);

    const label = NAME_MAP[brand];

    try {
      // 1) Seçimi SENKRON flush et
      flushSync(() => {
        select(label as WalletName);
      });

      // 2) Bağlan (timeout ile)
      try {
        await timeout(connect());
      } catch (e: any) {
        if (isNotSelected(e)) {
          // Bazı ortamlarda bir microtask gecikme gerekebiliyor
          await Promise.resolve();
          await timeout(connect());
        } else {
          throw e;
        }
      }
      // success → useEffect kapatır
    } catch (e: any) {
      // UI'yı asla kilitleme — temizle ve mesaj göster
      const s = (e?.name || '') + ' ' + (e?.message || '');
      let msg =
        /connect-timeout/i.test(s)
          ? 'Wallet did not respond. Please try again.'
          : /UserRejected|4001/i.test(s)
          ? 'Request was rejected.'
          : /WindowClosed|PopupClosed/i.test(s)
          ? 'Wallet window was closed.'
          : e?.message || String(e) || 'Failed to connect.';

      try { await disconnect(); } catch {}
      setErr(msg);
      setBusy(false);
      setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Eğer DialogOverlay export edilmiyorsa bu satırı kaldırabilirsiniz */}
      <DialogOverlay className="z-[90]" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-[100] shadow-lg">
        <DialogTitle className="text-white">Connect a Solana wallet</DialogTitle>
        <DialogDescription className="sr-only">Choose a wallet to connect to Coincarnation.</DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {BRANDS.map((b) => {
            const isBusy = (busy || connecting) && clicked === b.id;
            const isInstalled = installed.has(NAME_MAP[b.id]);
            return (
              <button
                key={b.id}
                onClick={() => handleClick(b.id)}
                disabled={busy || connecting}
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
