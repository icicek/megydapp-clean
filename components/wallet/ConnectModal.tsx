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

// UI kartları (sabit sıra)
type Brand = 'phantom' | 'solflare' | 'backpack' | 'walletconnect';
type UIItem = { key: Brand; label: string; note?: string };
type Card   = { key: Brand; label: string; note?: string; installed: boolean; adapterName?: string };

const UI: UIItem[] = [
  { key: 'phantom',       label: 'Phantom' },
  { key: 'solflare',      label: 'Solflare' },
  { key: 'backpack',      label: 'Backpack' },
  { key: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile' },
];

// ---- helpers --------------------------------------------------------------

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, ''); // "Solflare (Extension)" -> "solflareextension"
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const timeout = <T,>(p: Promise<T>, ms = 10_000) =>
  Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('connect-timeout')), ms))]);

const isNotSelected  = (e: any) => /walletnotselectederror/i.test(((e?.name || '') + ' ' + (e?.message || '')).toLowerCase());
const isUserRejected = (e: any) => /userrejected|4001/.test(((e?.name || '') + ' ' + (e?.message || '')).toLowerCase());
const isPopupClosed  = (e: any) => /windowclosed|popupclosed/.test(((e?.name || '') + ' ' + (e?.message || '')).toLowerCase());

export default function ConnectModal({ open, onClose }: Props) {
  const { select, connect, disconnect, connected, connecting, wallets } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal açılınca temizle
  useEffect(() => {
    if (open) { setErr(null); setClicked(null); setBusy(false); }
  }, [open]);

  // Bağlanınca kapat
  useEffect(() => {
    if (connected && open) onClose();
  }, [connected, open, onClose]);

  // Cihazdaki gerçek adapter'ları markalara haritala
  const mapByBrand = useMemo(() => {
    const m = new Map<Brand, { adapterName: string; installed: boolean }>();
    for (const w of wallets) {
      const nm = normalize(w.adapter.name); // "phantom", "solflareextension", "walletconnect" vs.
      const installed =
        ((w as any).readyState === 'Installed' || (w as any).readyState === 'Loadable' ||
         (w.adapter as any).readyState === 'Installed' || (w.adapter as any).readyState === 'Loadable');

      if (nm.includes('phantom'))        m.set('phantom', { adapterName: w.adapter.name, installed });
      else if (nm.includes('solflare'))  m.set('solflare', { adapterName: w.adapter.name, installed });
      else if (nm.includes('backpack'))  m.set('backpack', { adapterName: w.adapter.name, installed });
      else if (nm.includes('walletconnect')) m.set('walletconnect', { adapterName: w.adapter.name, installed });
    }
    return m;
  }, [wallets]);

  // UI kartları (Installed rozeti ve gerçek adapterName ile)
  const cards = useMemo<Card[]>(() => {
    return UI.map(({ key, label, note }) => {
      const hit = mapByBrand.get(key);
      return { key, label, note, installed: !!hit?.installed, adapterName: hit?.adapterName };
    });
  }, [mapByBrand]);

  // ---- core: seçim + bağlanma ------------------------------------------------

  async function handleClick(brand: Brand) {
    if (busy) return;
    setErr(null);
    setClicked(brand);
    setBusy(true);

    try {
      const hit = mapByBrand.get(brand);
      if (!hit?.adapterName) throw new Error('Selected wallet adapter is not available.');

      // Önceki yarım kalmış denemeyi temizle (connecting takılı kaldıysa)
      if (connecting) {
        try { await disconnect(); } catch {}
        await sleep(50);
      }

      // 1) select → SENKRON commit (race'i kes)
      flushSync(() => { select(hit.adapterName as WalletName); });

      // 2) connect → sadece "NotSelected" için kısa backoff'larla tekrar dene
      const backoff = [0, 16, 32, 64, 128, 256, 512] as const;
      for (let i = 0; i < backoff.length; i++) {
        try {
          await timeout(connect(), 10_000);
          return; // success (connected effect kapatır)
        } catch (e: any) {
          if (isNotSelected(e)) { await sleep(backoff[i]); continue; }
          if (isUserRejected(e) || isPopupClosed(e)) throw e;
          throw e; // farklı hata -> dışarı
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
      // UI'yi kilitleme
      try { await disconnect(); } catch {}
      setErr(msg);
      setBusy(false);
      setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* DialogOverlay export edilmiyorsa bu satırı kaldırın */}
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
