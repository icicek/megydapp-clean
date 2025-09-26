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

/** UI marka sıralaması */
const ORDER = ['Phantom', 'Solflare', 'Backpack', 'WalletConnect'] as const;
type Brand = 'phantom' | 'solflare' | 'backpack' | 'walletconnect';

export default function ConnectModal({ open, onClose }: Props) {
  const { select, connect, connected, connecting, wallets } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setErr(null); setClicked(null); setBusy(false); }
  }, [open]);

  useEffect(() => {
    if (connected && open) onClose();
  }, [connected, open, onClose]);

  // wallets[] → adı → entry map'i (gerçek adapter.name ile)
  const byName = useMemo(() => {
    const m = new Map<string, (typeof wallets)[number]>();
    for (const w of wallets) m.set(w.adapter.name.toLowerCase(), w);
    return m;
  }, [wallets]);

  // UI için kart listesi: gerçek adapter bulunur (Installed rozetini doğru göstermek için)
  const cards = useMemo(() => {
    const pick = (needle: string) =>
      wallets.find(w => w.adapter.name.toLowerCase().includes(needle));
    return [
      pick('phantom'),
      pick('solflare'),
      pick('backpack'),
      pick('walletconnect'),
    ] as (typeof wallets)[number][];
  }, [wallets]);

  const isNotSelected = (e: any) =>
    /WalletNotSelectedError/i.test(((e?.name || '') + ' ' + (e?.message || '')));

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function connectAfterSelect(targetName: string) {
    // select'i SENKRON flush et
    flushSync(() => { select(targetName as WalletName); });

    // Sadece NotSelected gelirse artan beklemeyle yeniden dene
    const delays = [0, 16, 32, 64, 128, 256] as const;
    for (let i = 0; i < delays.length; i++) {
      try {
        await connect();
        return; // başarı
      } catch (e: any) {
        if (!isNotSelected(e)) throw e;
        await sleep(delays[i]);
      }
    }
    // hâlâ seçilmediyse net hata
    throw Object.assign(new Error('WalletNotSelectedError'), { name: 'WalletNotSelectedError' });
  }

  async function handleClick(brand: Brand) {
    if (busy) return;
    setErr(null);
    setClicked(brand);
    setBusy(true);

    // Tıklanan marka için gerçek adapter'ı bul
    const needle = brand.toLowerCase(); // 'phantom' | 'solflare' | ...
    const target =
      wallets.find(w => w.adapter.name.toLowerCase().includes(needle)) || null;

    if (!target) {
      setErr('Selected wallet adapter is not available.');
      setBusy(false);
      setClicked(null);
      return;
    }

    try {
      await connectAfterSelect(target.adapter.name);
      // success → useEffect kapatır
    } catch (e: any) {
      const s = (e?.name || '') + ' ' + (e?.message || '');
      let msg =
        /UserRejected|4001/i.test(s) ? 'Request was rejected.' :
        /WindowClosed|PopupClosed/i.test(s) ? 'Wallet window was closed.' :
        /WalletNotSelectedError/i.test(s) ? 'Wallet not selected — please try again.' :
        e?.message || String(e) || 'Failed to connect.';
      setErr(msg);
      setBusy(false);
      setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* ui/dialog Overlay komponentin yoksa bu satırı kaldır */}
      <DialogOverlay className="z-[90]" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-[100] shadow-lg">
        <DialogTitle className="text-white">Connect a Solana wallet</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a wallet to connect to Coincarnation.
        </DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {cards.map((entry, idx) => {
            // entry null olabilir; UI yine de kartları sabit sırada göstersin
            const label = (ORDER[idx] ?? 'Wallet') as (typeof ORDER)[number];
            const installed =
              !!entry &&
              ((entry as any).readyState === 'Installed' ||
               (entry as any).readyState === 'Loadable' ||
               (entry.adapter as any).readyState === 'Installed' ||
               (entry.adapter as any).readyState === 'Loadable');

            // label → brand key tahmini
            const brand = label.toLowerCase() as Brand;
            const isBusy = (busy || connecting) && clicked === brand;

            return (
              <button
                key={label}
                onClick={() => handleClick(brand)}
                disabled={busy || connecting}
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
                {label === 'WalletConnect' && (
                  <div className="text-xs text-gray-400 mt-1">QR / Mobile</div>
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

        {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
      </DialogContent>
    </Dialog>
  );
}
