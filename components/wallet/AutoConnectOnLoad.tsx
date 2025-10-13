// components/wallet/AutoConnectOnLoad.tsx
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { connectStable } from '@/lib/solana/connectStable';
import { logEvent } from '@/lib/analytics';

const LAST_KEY = 'cc:lastWalletBrand';

function hasAnyInjected() {
  if (typeof window === 'undefined') return false;
  const w: any = window as any;
  return !!(w.solana || w.backpack || w.solflare || w.phantom);
}

export default function AutoConnectOnLoad() {
  const api = useWallet();
  const { wallets, select, connected } = api;
  const triedRef = useRef(false);

  // brand -> adapterName eşlemesi
  const adapters = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of wallets) {
      const name = w.adapter.name.toLowerCase();
      if (name.includes('phantom'))  m.set('phantom',  w.adapter.name);
      if (name.includes('solflare')) m.set('solflare', w.adapter.name);
      if (name.includes('backpack')) m.set('backpack', w.adapter.name);
    }
    return m;
  }, [wallets]);

  useEffect(() => {
    if (triedRef.current) return;
    if (connected) return;

    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const ac = params.get('ac') === '1';
    if (!ac) return;

    triedRef.current = true;

    const brandParam = (params.get('brand') || localStorage.getItem(LAST_KEY) || '').toLowerCase();
    const brand =
      brandParam.includes('phantom')  ? 'phantom'  :
      brandParam.includes('solflare') ? 'solflare' :
      brandParam.includes('backpack') ? 'backpack' : null;

    const desiredAdapter = brand ? adapters.get(brand) : undefined;

    logEvent('autoconnect_attempt', { brand: brand || 'unknown' });

    // 0.2s aralıkla max 4s dene: injection + adapter hazır olunca bağlan
    const MAX_MS = 4000;
    const STEP   = 200;
    const start  = Date.now();

    const iv = setInterval(async () => {
      if (connected) { clearInterval(iv); return; }

      const injected = hasAnyInjected();
      // adapter seçimi: önce hedef adapter, yoksa Installed/Loadable olan ilk adapter
      const adapterName =
        desiredAdapter ||
        wallets.find(w => {
          const rs = (w as any).readyState ?? (w.adapter as any).readyState;
          return rs === 'Installed' || rs === 'Loadable';
        })?.adapter.name;

      if (injected && adapterName) {
        clearInterval(iv);
        try {
          await select(adapterName as WalletName);
          await connectStable(adapterName as WalletName, api);
          logEvent('autoconnect_success', { brand: brand || 'unknown', adapter: adapterName });

          // URL'den paramları temizle
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('ac');
            url.searchParams.delete('brand');
            window.history.replaceState({}, '', url.toString());
          } catch {}
        } catch (e: any) {
          logEvent('autoconnect_error', { brand: brand || 'unknown', message: e?.message || String(e) });
        }
        return;
      }

      if (Date.now() - start > MAX_MS) {
        clearInterval(iv);
        logEvent('autoconnect_skip', {
          reason: !injected ? 'no-injection' : 'no-adapter',
          brand: brand || 'unknown',
        });
      }
    }, STEP);

    return () => clearInterval(iv);
  }, [wallets, adapters, api, select, connected]);

  return null;
}
