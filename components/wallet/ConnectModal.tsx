'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const attemptRef = useRef<number>(0); // eşzamanlı / sarkan denemeleri iptal etmek için

  // Modal açıldığında UI sıfırla
  useEffect(() => {
    if (open) { setErr(null); setClicked(null); setBusy(false); }
  }, [open]);

  // Bağlandığında modalı kapat
  useEffect(() => {
    if (connected && open) {
      setErr(null); setClicked(null); setBusy(false);
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

  // ---------- util ----------
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
  function isNotSelectedOrReady(e: any) {
    const s = (e?.name || '') + ' ' + (e?.message || '');
    return /WalletNotSelectedError|WalletNotReady|ReadyState|not detected/i.test(s);
  }
  async function disconnectSafely() {
    try { await wallet?.adapter?.disconnect?.(); } catch {}
    try { await disconnect?.(); } catch {}
  }

  // ---------- çekirdek: tek denemelik bağlanma (user-gesture içinde çağrılır) ----------
  async function tryOnce(label: string, attempt: number) {
    const entry = wallets.find((w) => w.adapter.name === label);
    if (!entry) throw new Error(`${label} adapter not available`);
    const adapter = entry.adapter;

    // Her seferde temiz başlangıç — yarım kalmış state'i at
    await disconnectSafely();

    // Seçimi kalıcı kıl (WalletProvider state'i için)
    select(adapter.name as WalletName);

    // Event'leri dinle
    const off: Array<() => void> = [];
    const on = (ev: string, fn: any) => {
      (adapter as any).on?.(ev, fn);
      off.push(() => (adapter as any).off?.(ev, fn));
    };

    // Promise: event veya connect() resolve/reject'ten hangisi önce gelirse
    const connectedByEvent = new Promise<void>((resolve, reject) => {
      on('connect', () => resolve());
      on('error', (e: any) => reject(e));
      on('disconnect', () => reject(new Error('disconnected-during-connect')));
    });

    // Aynı tıklama zincirinde doğrudan adapter.connect() → user-gesture korunur
    const byCall = (adapter as any).connect ? (adapter as any).connect() : connect();

    try {
      // 1)  adapter.connect  ***VEYA***  connect event'i  ***VE***  hard-timeout
      await withTimeout(Promise.race([byCall, connectedByEvent]), 8000, 'connect');
      // Stale attempt'ı yoksay
      if (attemptRef.current !== attempt) throw new Error('stale-attempt');
      return; // success
    } finally {
      off.forEach((f) => f());
    }
  }

  // ---------- üst seviye: otomatik tek retry ile sağlam bağlan ----------
  async function connectRobust(label: string) {
    const myAttempt = ++attemptRef.current;
    try {
      await tryOnce(label, myAttempt);
      return; // ilk denemede başarı
    } catch (e: any) {
      // Kullanıcı reddi/pencere kapama → net mesajla bitir
      if (isUserRejected(e) || isWindowClosed(e)) throw e;

      // Not selected / not ready / timeout / disconnect vb. → 1 kez daha dene
      await sleep(200); // minik tampon
      if (attemptRef.current !== myAttempt) throw new Error('stale-attempt');
      try {
        await tryOnce(label, myAttempt);
        return;
      } catch (e2: any) {
        // yine kullanıcı iptali ise ilet; değilse zaman aşımı mesajı
        if (isUserRejected(e2) || isWindowClosed(e2)) throw e2;
        if (isNotSelectedOrReady(e2) || /timeout|stale-attempt|disconnected-during-connect/i.test(String(e2?.message || e2))) {
          throw new Error('Wallet did not respond. Please try again.');
        }
        throw e2;
      }
    }
  }

  async function handleClick(brand: Brand) {
    if (busy) return;
    setErr(null);
    setClicked(brand);
    setBusy(true);
    try {
      const label = NAME_MAP[brand];
      await connectRobust(label);
      // success → useEffect kapatır
    } catch (e: any) {
      const msg =
        isUserRejected(e) ? 'Request was rejected.' :
        isWindowClosed(e) ? 'Wallet window was closed.' :
        e?.message || String(e) || 'Failed to connect.';
      setErr(msg);
      setClicked(null);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* ui/dialog Overlay export etmiyorsa import ve bu satırı kaldırabilirsiniz */}
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
