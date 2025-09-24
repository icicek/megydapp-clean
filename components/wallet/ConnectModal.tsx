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
  const { select, connect, disconnect, connected, wallets, wallet } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal açılınca UI reset
  useEffect(() => {
    if (open) { setErr(null); setClicked(null); setBusy(false); }
  }, [open]);

  // Bağlanınca otomatik kapan
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

  // ------- utils -------
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  function withTimeout<T>(p: Promise<T>, ms: number, tag = 'op') {
    let id: any;
    const t = new Promise<never>((_, rej) => { id = setTimeout(() => rej(new Error(`${tag}:timeout`)), ms); });
    return Promise.race([p, t]).finally(() => clearTimeout(id));
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

  // ------- ana akış: CLICK içinde SENKRON adapter.connect -------
  async function connectImmediately(label: string) {
    const target = wallets.find((w) => w.adapter.name === label);
    if (!target) throw new Error(`${label} adapter not available`);

    // Marka değişiyorsa önce temizle
    if (wallet?.adapter?.name && wallet.adapter.name !== label) {
      await disconnectSafely();
      // burada frame beklemeyelim; user gesture kaybolmasın
    }

    // 1) select (persist için)
    select(target.adapter.name as WalletName);

    // 2) ***KRİTİK***: Aynı tıklama zincirinde doğrudan adapter.connect()
    //    (user gesture'ı korur; Solflare/Phantom popup engellenmez)
    const adapterConnect = target.adapter?.connect
      ? target.adapter.connect()
      : connect();

    // 3) Adapter'ın dönmemesi ihtimaline karşı hard-timeout
    //    (uzatılmış süre: bazı cüzdanlar popup açıp bekletiyor)
    await withTimeout(adapterConnect, 8000, 'adapter-connect');

    // başarı → context kendi kendine "connected" yapacak (event ile)
  }

  // Fallback: adapter.connect çökerse/timeout olursa context.connect’i birkaç kez dene
  async function connectFallback() {
    const ATTEMPTS = 6;
    for (let i = 0; i < ATTEMPTS; i++) {
      try {
        await withTimeout(connect(), 1500, 'ctx-connect');
        return;
      } catch (e: any) {
        if (isUserRejected(e)) throw new Error('Request was rejected.');
        if (isWindowClosed(e)) throw new Error('Wallet window was closed.');
        // sadece timeout gibi durumlarda tekrar dene
        await sleep(100 + i * 100);
      }
    }
    throw new Error('Wallet did not respond.');
  }

  async function handleClick(brand: Brand) {
    if (busy) return;
    setErr(null);
    setClicked(brand);
    setBusy(true);

    const label = NAME_MAP[brand];

    try {
      await connectImmediately(label);
      // success → useEffect kapatır
    } catch (e: any) {
      // Kullanıcı reddi/pencere kapatma ise doğrudan mesajla bitir
      if (isUserRejected(e) || isWindowClosed(e)) {
        setErr(e.message || 'Request was cancelled.');
        setClicked(null);
        setBusy(false);
        return;
      }

      // Adapter yanıt vermedi ya da başka bir hata → context.connect fallback
      try {
        await connectFallback();
        // success → useEffect kapatır
      } catch (e2: any) {
        const msg =
          e2?.message === 'Request was rejected.' ||
          e2?.message === 'Wallet window was closed.'
            ? e2.message
            : e2?.message || String(e2) || 'Failed to connect.';
        setErr(msg);
        setClicked(null);
        setBusy(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* ui/dialog Overlay export etmiyorsa import ve bu satırı kaldırın */}
      <DialogOverlay className="z-[90]" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-[100] shadow-lg">
        <DialogTitle className="text-white">Connect a Solana wallet</DialogTitle>
        <DialogDescription className="sr-only">Choose a wallet to connect</DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {BRANDS.map((b) => {
            const isBusy = busy && clicked === b.id;
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
