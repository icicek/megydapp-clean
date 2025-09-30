// components/wallet/ConnectModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogOverlay, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';

type Props = { open: boolean; onClose: () => void };

export type Brand = 'phantom' | 'solflare' | 'backpack' | 'walletconnect';
type UIItem = { key: Brand; label: string; note?: string };
type Card   = { key: Brand; label: string; note?: string; installed: boolean; adapterName?: string };

const UI: UIItem[] = [
  { key: 'phantom',       label: 'Phantom' },
  { key: 'solflare',      label: 'Solflare' },
  { key: 'backpack',      label: 'Backpack' },
  { key: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const timeout = <T,>(p: Promise<T>, ms = 10_000) =>
  Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('connect-timeout')), ms))]);
const isNotSelected  = (e: any) => /walletnotselectederror/i.test(((e?.name||'')+' '+(e?.message||'')).toLowerCase());
const isUserRejected = (e: any) => /userrejected|4001/.test(((e?.name||'')+' '+(e?.message||'')).toLowerCase());
const isPopupClosed  = (e: any) => /windowclosed|popupclosed/.test(((e?.name||'')+' '+(e?.message||'')).toLowerCase());

export default function ConnectModal({ open, onClose }: Props) {
  const api = useWallet();
  const { wallets, select, connect, disconnect, connected, wallet } = api;
  const connecting = (api as any).connecting as boolean;
  const disconnecting = (api as any).disconnecting as boolean;

  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal açılınca temizle
  useEffect(() => { if (open) { setErr(null); setClicked(null); setBusy(false); } }, [open]);
  // Bağlanınca kapat
  useEffect(() => { if (connected && open) onClose(); }, [connected, open, onClose]);

  // Cihaz adapter’larını markalara eşle
  const mapByBrand = useMemo(() => {
    const m = new Map<Brand, { adapterName: string; installed: boolean }>();
    for (const w of wallets) {
      const n = norm(w.adapter.name);
      const installed =
        ((w as any).readyState === 'Installed' || (w as any).readyState === 'Loadable' ||
         (w.adapter as any).readyState === 'Installed' || (w.adapter as any).readyState === 'Loadable');

      if (n.includes('phantom')) m.set('phantom', { adapterName: w.adapter.name, installed });
      else if (n.includes('solflare')) m.set('solflare', { adapterName: w.adapter.name, installed });
      else if (n.includes('backpack')) m.set('backpack', { adapterName: w.adapter.name, installed });
      else if (n.includes('walletconnect')) m.set('walletconnect', { adapterName: w.adapter.name, installed });
    }
    return m;
  }, [wallets]);

  // UI kartları
  const cards = useMemo<Card[]>(() =>
    UI.map(({ key, label, note }) => {
      const hit = mapByBrand.get(key);
      return { key, label, note, installed: !!hit?.installed, adapterName: hit?.adapterName };
    }),
  [mapByBrand]);

  // Bağlanma denemesini tek yere topla
  const tryConnect = async () => {
    const backoff = [0, 16, 32, 64, 128, 256, 512] as const;
    for (let i = 0; i < backoff.length; i++) {
      try { await timeout(connect(), 10_000); return; }
      catch (e: any) {
        if (isNotSelected(e)) { await sleep(backoff[i]); continue; }
        if (isUserRejected(e) || isPopupClosed(e)) throw e;
        throw e;
      }
    }
    throw new Error('WalletNotSelectedError');
  };

  // 🔒 Disconnect tamam olmadan cüzdan değişme
  const ensureCleanBeforeSwitch = async (targetName: string) => {
    const changing =
      (!!wallet && wallet.adapter?.name !== targetName) || connecting || disconnecting || connected;

    if (!changing) return;
    try { await disconnect(); } catch {}
    for (let i = 0; i < 20; i++) {
      const nowConnecting = (api as any).connecting as boolean;
      const nowDisconnecting = (api as any).disconnecting as boolean;
      const nowConnected = api.connected;
      if (!nowDisconnecting && !nowConnected && !nowConnecting) break;
      await sleep(50);
    }
  };

  async function handlePick(brand: Brand) {
    if (busy) return;
    setErr(null); setClicked(brand); setBusy(true);

    const hit = mapByBrand.get(brand);
    if (!hit?.adapterName) {
      setErr('Selected wallet adapter is not available.');
      setBusy(false); setClicked(null); return;
    }

    try {
      // 0) Mevcut bağlantıyı TEMİZLE (await)
      await ensureCleanBeforeSwitch(hit.adapterName);

      // 1) Kullanıcı jestinde select → HEMEN connect denemesi (await etmeden başlat)
      select(hit.adapterName as WalletName);
      // İlk denemeyi bekletmeden başlat (popup engellenmesin)
      const first = tryConnect();

      // 2) İlk deneme başarısız olursa yakala
      try { await first; }
      catch (e: any) {
        // NotSelected dışı ise doğrudan hata
        if (!isNotSelected(e)) throw e;
        // NotSelected ise: çok kısa gecikme + temizle + tekrar seç + tekrar connect
        try { await disconnect(); } catch {}
        await sleep(50);
        select(hit.adapterName as WalletName);
        await tryConnect();
      }
      // success → effect modalı kapatır
    } catch (e: any) {
      const s = (e?.name || '') + ' ' + (e?.message || '');
      const msg =
        /connect-timeout/i.test(s) ? 'Wallet did not respond. Please try again.' :
        isUserRejected(e) ? 'Request was rejected.' :
        isPopupClosed(e)  ? 'Wallet window was closed.' :
        isNotSelected(e)  ? 'Wallet not selected — please try again.' :
        e?.message || String(e) || 'Failed to connect.';
      try { await disconnect(); } catch {}
      setErr(msg); setBusy(false); setClicked(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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
                // 🔑 Popup engelleyicileri için onPointerDown
                onPointerDown={() => handlePick(key)}
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
