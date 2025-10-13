// components/wallet/AutoConnectOnLoad.tsx
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { connectStable } from '@/lib/solana/connectStable';
import { logEvent } from '@/lib/analytics';

const LAST_KEY = 'cc:lastWalletBrand';

const isWalletInAppUA = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /(Solflare|Phantom|Backpack|xNFT)/i.test(ua);
};

const hasInjected = () => {
  if (typeof window === 'undefined') return false;
  const w: any = window as any;
  return !!(w.solana || w.backpack || w.solflare);
};

export default function AutoConnectOnLoad() {
  const api = useWallet();
  const { wallets, select, connected } = api;
  const triedRef = useRef(false);

  const adapters = useMemo(() => {
    const m = new Map<string, string>(); // brand -> adapterName
    for (const w of wallets) {
      const name = w.adapter.name.toLowerCase();
      if (name.includes('phantom')) m.set('phantom', w.adapter.name);
      if (name.includes('solflare')) m.set('solflare', w.adapter.name);
      if (name.includes('backpack')) m.set('backpack', w.adapter.name);
    }
    return m;
  }, [wallets]);

  useEffect(() => {
    if (triedRef.current) return;
    if (connected) return;
    if (!isWalletInAppUA() || !hasInjected()) return;

    const params = new URLSearchParams(window.location.search);
    const ac = params.get('ac') === '1';
    if (!ac) return;

    triedRef.current = true;

    const brandParam = (params.get('brand') || localStorage.getItem(LAST_KEY) || '').toLowerCase();
    const brand =
      brandParam.includes('phantom') ? 'phantom' :
      brandParam.includes('solflare') ? 'solflare' :
      brandParam.includes('backpack') ? 'backpack' : null;

    const adapterName = brand ? adapters.get(brand) : undefined;
    if (!adapterName) {
      logEvent('autoconnect_skip', { reason: 'no-adapter', brand: brandParam || 'unknown' });
      return;
    }

    logEvent('autoconnect_attempt', { brand });

    const t = setTimeout(async () => {
      try {
        await select(adapterName as WalletName);
        await connectStable(adapterName as WalletName, api);
        logEvent('autoconnect_success', { brand });

        // URL’i temizle (ac & brand paramlarını kaldır)
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('ac');
          url.searchParams.delete('brand');
          window.history.replaceState({}, '', url.toString());
        } catch {}
      } catch (e: any) {
        logEvent('autoconnect_error', { brand, message: e?.message || String(e) });
      }
    }, 350);

    return () => clearTimeout(t);
  }, [adapters, api, select, connected]);

  return null;
}
