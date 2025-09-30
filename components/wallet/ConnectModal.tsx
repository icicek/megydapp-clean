// components/wallet/ConnectModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogOverlay, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { connectStable } from '@/lib/solana/connectStable';

type Props = { open: boolean; onClose: () => void };
export type Brand = 'phantom' | 'solflare' | 'backpack';

type UIItem = { key: Brand; label: string; note?: string };
type Card   = { key: Brand; label: string; note?: string; installed: boolean; adapterName?: string };

const UI: UIItem[] = [
  { key: 'phantom',  label: 'Phantom'  },
  { key: 'solflare', label: 'Solflare' },
  { key: 'backpack', label: 'Backpack' },
];

const INSTALL_URL: Record<Brand, string> = {
  phantom:  'https://phantom.app/download',
  solflare: 'https://solflare.com/download',
  backpack: 'https://www.backpack.app/download',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function ConnectModal({ open, onClose }: Props) {
  const api = useWallet();
  const { wallets, select, disconnect, connected } = api;
  const connecting = (api as any).connecting as boolean;
  const disconnecting = (api as any).disconnecting as boolean;

  const [err, setErr] = useState<string | null>(null);
  const [clicked, setClicked] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal açılınca temizle
  useEffect(() => { if (open) { setErr(null); setClicked(null); setBusy(false); } }, [open]);
  // Bağlanınca kapat
  useEffect(() => { if (connected && open) onClose(); }, [connected, open, onClose]);

  // Wallet Standard → marka eşleme
  const mapByBrand = useMemo(() => {
    const m = new Map<Brand, { adapterName: string; installed: boolean }>();
    for (const w of wallets) {
      const n = norm(w.adapter.name);
      const rs = (w as any).readyState ?? (w.adapter as any).readyState;
      const installed = rs === 'Installed' || rs === 'Loadable';
      if (n.includes('phantom'))  m.set('phantom',  { adapterName: w.adapter.name, installed });
      if (n.includes('solflare')) m.set('solflare', { adapterName: w.adapter.name, installed });
      if (n.includes('backpack')) m.set('backpack', { adapterName: w.adapter.name, installed });
    }
    return m;
  }, [wallets]);

  const cards = useMemo<Card[]>(
    () => UI.map(({ key, label, note }) => {
      const hit = mapByBrand.get(key);
      return { key, label, note, installed: !!hit?.installed, adapterName: hit?.adapterName };
    }),
    [mapByBrand]
  );

  // Disconnect/connecting durumlarını temizlemeden cüzdan değiştirmeyelim
  const ensureCleanBeforeSwitch = async () => {
    if (!connecting && !disconnecting && !connected) return;
    try { await disconnect(); } catch {}
    for (let i = 0; i < 20; i++) {
      const nowConnecting = (api as any).connecting as boolean;
      const nowDisconnecting = (api as any).disconnecting as boolean;
      const nowConnected = api.connected;
      if (!nowDisconnecting && !nowConnected && !nowConnecting) break;
      await sleep(40);
    }
  };

  async function handlePick(brand: Brand) {
    if (busy) return;
    setErr(null); setClicked(brand); setBusy(true);

    const hit = mapByBrand.get(brand);

    // YOKSA → Install sayfası
    if (!hit?.adapterName || !hit.installed) {
      window.open(INSTALL_URL[brand], '_blank', 'noopener,noreferrer');
      setBusy(false);
      setClicked(null);
      return;
    }

    try {
      // 0) temizle
      await ensureCleanBeforeSwitch();

      // 1) select + ADAPTER.CONNECT → tekli ve stabil
      await select(hit.adapterName as WalletName);
      await connectStable(hit.adapterName, api);

      // Başarılı → effect modalı kapatır
    } catch (e: any) {
      const s = (e?.name || '') + ' ' + (e?.message || '');
      let msg = e?.message || String(e) || 'Failed to connect.';
      if (/connect-timeout/i.test(s)) msg = 'Wallet did not respond. Please try again.';
      setErr(msg);
      try { await disconnect(); } catch {}
      setBusy(false); setClicked(null);
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
                onPointerDown={() => handlePick(key)} // popup engelleyiciye karşı
                disabled={busy}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-3 text-left transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{label}</span>
                  {installed ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/30 border border-emerald-500/50">
                      Installed
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 border border-zinc-600">
                      Install
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
