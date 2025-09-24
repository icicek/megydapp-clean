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
  const { select, connect, disconnect, connected, connecting, wallets, wallet } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal her açıldığında eski UI durumunu temizle
  useEffect(() => {
    if (open) {
      setErr(null);
      setClicked(null);
      setBusy(false);
    }
  }, [open]);

  // Bağlandığında modalı kapat
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

  async function waitForSelection(expectedName: string, timeoutMs = 2000) {
    const start = performance.now();
    if (wallet?.adapter?.name === expectedName) return;
    while (performance.now() - start < timeoutMs) {
      await twoFrames();
      if (wallet?.adapter?.name === expectedName) return;
      await sleep(20);
    }
    // Süre dolsa da connect deneyip retry yapacağız.
  }

  function isNotSelectedError(e: any) {
    const s = (e?.name || '') + ' ' + (e?.message || '');
    return /WalletNotSelectedError/i.test(s);
  }
  function isNotReadyError(e: any) {
    const s = (e?.name || '') + ' ' + (e?.message || '');
    return /WalletNotReady|ReadyState|not detected/i.test(s);
  }
  function isUserRejected(e: any) {
    const s = (e?.name || '') + ' ' + (e?.message || '');
    return /UserRejected|UserRejectedRequest|4001/i.test(s);
  }
  function isWindowClosed(e: any) {
    const s = (e?.name || '') + ' ' + (e?.message || '');
    return /WindowClosed|PopupClosed/i.test(s);
  }

  async function disconnectSafely() {
    try { await wallet?.adapter?.disconnect?.(); } catch {}
    try { await disconnect?.(); } catch {}
  }

  async function connectRobust(label: string) {
    const target = wallets.find((w) => w.adapter.name === label);
    if (!target) throw new Error(`${label} adapter not available`);

    // Markayı değiştiriyorsak önce güvenli disconnect
    if (wallet?.adapter?.name && wallet.adapter.name !== label) {
      await disconnectSafely();
      await twoFrames();
    }

    // 1) Select
    select(target.adapter.name as WalletName);

    // 2) Seçimin context'e oturmasını bekle
    await waitForSelection(target.adapter.name, 2000);

    // 3) Artan aralıklı retry ile connect
    const ATTEMPTS = 15;      // ~15 deneme
    const BASE = 80;          // 80ms, 160, 240, ... ~1.2s
    for (let i = 0; i < ATTEMPTS; i++) {
      try {
        await connect();
        return; // success
      } catch (e: any) {
        if (isUserRejected(e)) throw new Error('Request was rejected.');
        if (isWindowClosed(e)) throw new Error('Wallet window was closed.');

        if (isNotSelectedError(e) || isNotReadyError(e)) {
          // Seçim/ready propagasyonu gecikti; bekle ve yeniden dene
          await sleep(BASE * (i + 1));
          continue;
        }

        // Diğer hatalarda doğrudan yukarı
        throw e;
      }
    }
    throw new Error('Connect timeout (please try again).');
  }

  async function handleClick(brand: Brand) {
    if (busy) return; // paralel denemeleri engelle
    setErr(null);
    setClicked(brand);
    setBusy(true);
    try {
      const label = NAME_MAP[brand];
      await connectRobust(label);
      // success → useEffect modalı kapatır
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
      {/* ui/dialog içinde Overlay export edilmiyorsa bu satırı kaldırabilirsiniz */}
      <DialogOverlay className="z-[90]" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-[100] shadow-lg">
        <DialogTitle className="text-white">Connect a Solana wallet</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a wallet to connect to Coincarnation.
        </DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {BRANDS.map((b) => {
            const isBusy = busy && clicked === b.id; // ❗ yalnızca yerel busy
            const isInstalled = installed.has(NAME_MAP[b.id]);
            return (
              <button
                key={b.id}
                onClick={() => handleClick(b.id)}
                disabled={busy}
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
