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
import { flushSync } from 'react-dom';

type Props = { open: boolean; onClose: () => void };

// UI'de göstereceğimiz markalar
export type Brand = 'phantom' | 'solflare' | 'backpack' | 'walletconnect';
type UIItem = { key: Brand; label: string; note?: string };
type Card   = { key: Brand; label: string; note?: string; installed: boolean };

const UI: UIItem[] = [
  { key: 'phantom',       label: 'Phantom' },
  { key: 'solflare',      label: 'Solflare' },
  { key: 'backpack',      label: 'Backpack' },
  { key: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile' },
];

// ---- utils
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const timeout = <T,>(p: Promise<T>, ms = 10000) =>
  Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('connect-timeout')), ms))]);

const isNotSelected  = (e: any) => /WalletNotSelectedError/i.test(((e?.name || '') + ' ' + (e?.message || '')));
const isUserRejected = (e: any) => /UserRejected|4001/i.test(((e?.name || '') + ' ' + (e?.message || '')));
const isPopupClosed  = (e: any) => /WindowClosed|PopupClosed/i.test(((e?.name || '') + ' ' + (e?.message || '')));

export default function ConnectModal({ open, onClose }: Props) {
  const { select, connect, disconnect, connected, wallets } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal açılınca temizle
  useEffect(() => { if (open) { setErr(null); setClicked(null); setBusy(false); } }, [open]);

  // Bağlanınca kapan
  useEffect(() => { if (connected && open) onClose(); }, [connected, open, onClose]);

  // Kart listesi (note + installed bilgisiyle)
  const cards = useMemo<Card[]>(() => {
    return UI.map(({ key, label, note }) => {
      const entry = wallets.find(w => w.adapter.name.toLowerCase().includes(key));
      const installed = !!entry && (
        (entry as any).readyState === 'Installed' || (entry as any).readyState === 'Loadable' ||
        (entry?.adapter as any)?.readyState === 'Installed' || (entry?.adapter as any)?.readyState === 'Loadable'
      );
      return { key, label, note, installed };
    });
  }, [wallets]);

  // Seçilecek gerçek adapter adını bul
  function adapterNameFor(brand: Brand): string | null {
    const found = wallets.find(w => w.adapter.name.toLowerCase().includes(brand));
    return found?.adapter?.name ?? null; // ör: "Solflare", "Solflare (Extension)" vs.
  }

  async function handleClick(brand: Brand) {
    if (busy) return;
    setErr(null);
    setClicked(brand);
    setBusy(true);

    try {
      const targetName = adapterNameFor(brand);
      if (!targetName) throw new Error('Selected wallet adapter is not available.');

      // 1) select'i SENKRON commit et (race'i keser)
      flushSync(() => { select(targetName as WalletName); });

      // 2) connect: sadece WalletNotSelectedError için artan beklemeli tekrar dene
      const backoff = [0, 16, 32, 64, 128, 256, 512] as const;
      for (let i = 0; i < backoff.length; i++) {
        try {
          await timeout(connect(), 10000);
          return; // success (connected effect kapatır)
        } catch (e: any) {
          if (isNotSelected(e)) { await sleep(backoff[i]); continue; }
          if (isUserRejected(e) || isPopupClosed(e)) throw e; // net kullanıcı aksiyonu
          throw e;
        }
      }
      throw new Error('WalletNotSelectedError');
    } catch (e: any) {
      const s = (e?.name || '') + ' ' + (e?.message || '');
      const msg =
        /connect-timeout/i.test(s) ? 'Wallet did not respond. Please try again.' :
        isUserRejected(e) ? 'Request was rejected.' :
        isPopupClosed(e)  ? 'Wallet window was closed.' :
        isNotSelected(e)  ? 'Wallet not selected — please try again.' :
        e?.message || String(e) || 'Failed to connect.';
      try { await disconnect(); } catch {}
      setErr(msg);
      setBusy(false);
      setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Eğer DialogOverlay export edilmiyorsa bu satırı kaldırın */}
      <DialogOverlay className="z-[90]" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-[100] shadow-lg">
        <DialogTitle className="text-white">Connect a Solana wallet</DialogTitle>
        <DialogDescription className="sr-only">Choose a wallet to connect to Coincarnation.</DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {cards.map(({ key, label, note, installed }) => {
            const isBusy = busy && clicked === key;
            return (
              <button
                key={key}
                onClick={() => handleClick(key)}
                disabled={busy}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-3 text-left transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{label}</span>
                  {installed && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/30 border border-emerald-500/50">
                      Installed
                    </span>
                  )}
                </div>
                {note && <div className="text-xs text-gray-400 mt-1">{note}</div>}
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
