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
  // Phantom/Solflare/Backpack değişik şekillerde enjekte edebiliyor
  return !!(w.solana || w.phantom || w.solflare || w.backpack);
}

// Bazı cüzdanlarda connect user gesture isteyebilir → ilk etkileşimde tekrar dene
function armFirstGestureOnce(fn: () => void) {
  let armed = true;
  const once = async () => {
    if (!armed) return;
    armed = false;
    try {
      remove();
      await Promise.resolve(fn());
    } catch {
      // no-op
    }
  };
  const remove = () => {
    document.removeEventListener('touchstart', once);
    document.removeEventListener('mousedown', once);
    document.removeEventListener('keydown', once);
  };
  document.addEventListener('touchstart', once, { once: true, passive: true });
  document.addEventListener('mousedown', once, { once: true });
  document.addEventListener('keydown', once, { once: true });
  return remove;
}

export default function AutoConnectOnLoad() {
  const api = useWallet();
  const { wallets, select, connected } = api;

  // en son değerleri interval içinde kullanmak için ref’ler
  const walletsRef = useRef(wallets);
  const connectedRef = useRef(connected);
  useEffect(() => { walletsRef.current = wallets; }, [wallets]);
  useEffect(() => { connectedRef.current = connected; }, [connected]);

  // brand -> adapterName
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

  const runnerRef = useRef<number | null>(null); // interval id
  const armedGestureRef = useRef<null | (() => void)>(null); // gesture remover

  useEffect(() => {
    // URL paramı yoksa çık
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const ac = params.get('ac') === '1';
    if (!ac) return;

    // Wallet adapter listesi gelene kadar bekle (kritik!)
    if (wallets.length === 0) return;

    // zaten bağlanmışsa çık
    if (connected) return;

    // zaten bir runner çalışıyorsa tekrar başlatma
    if (runnerRef.current !== null) return;

    const brandParam = (params.get('brand') || localStorage.getItem(LAST_KEY) || '').toLowerCase();
    const brand =
      brandParam.includes('phantom')  ? 'phantom'  :
      brandParam.includes('solflare') ? 'solflare' :
      brandParam.includes('backpack') ? 'backpack' : null;

    logEvent('autoconnect_attempt', { brand: brand || 'unknown' });

    const MAX_MS = 6000;
    const STEP   = 200;
    const started = Date.now();

    const tryConnect = async () => {
      if (connectedRef.current) return true;

      const injected = hasAnyInjected();

      // adapter seçimi: istenen adapter öncelikli; yoksa Installed/Loadable ilk adapter
      const wl = walletsRef.current;
      const desiredAdapter = brand ? adapters.get(brand) : undefined;
      const fallbackAdapter =
        wl.find(w => {
          const rs = (w as any).readyState ?? (w.adapter as any).readyState;
          return rs === 'Installed' || rs === 'Loadable';
        })?.adapter.name;

      const adapterName = desiredAdapter || fallbackAdapter;

      if (!injected || !adapterName) return false;

      try {
        await select(adapterName as WalletName);
        await connectStable(adapterName as WalletName, api);

        // Başarılı → URL temizle
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('ac');
          url.searchParams.delete('brand');
          window.history.replaceState({}, '', url.toString());
        } catch {}

        logEvent('autoconnect_success', { brand: brand || 'unknown', adapter: adapterName });
        return true;
      } catch (e: any) {
        const msg = (e?.message || String(e) || '').toLowerCase();

        // gesture gerekli ise: ilk etkileşime bağlanmayı arma
        if (/gesture|user gesture|required|request denied|rejected/.test(msg)) {
          if (!armedGestureRef.current) {
            armedGestureRef.current = armFirstGestureOnce(async () => {
              try {
                await select(adapterName as WalletName);
                await connectStable(adapterName as WalletName, api);

                try {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('ac');
                  url.searchParams.delete('brand');
                  window.history.replaceState({}, '', url.toString());
                } catch {}

                logEvent('autoconnect_success', { brand: brand || 'unknown', adapter: adapterName, via: 'gesture' });
              } catch (err: any) {
                logEvent('autoconnect_error', { brand: brand || 'unknown', message: err?.message || String(err) });
              }
            });
          }
          // interval çalışmaya devam etsin; injection/adapter değişirse daha erken yakalar
          return false;
        }

        // başka hata → logla ama denemeyi sürdür (süre bitene kadar)
        logEvent('autoconnect_error', { brand: brand || 'unknown', message: e?.message || String(e) });
        return false;
      }
    };

    const tick = async () => {
      const ok = await tryConnect();
      if (ok || Date.now() - started > MAX_MS) {
        // bitti
        if (!ok) {
          const injected = hasAnyInjected();
          logEvent('autoconnect_skip', { reason: injected ? 'no-adapter' : 'no-injection', brand: brand || 'unknown' });
        }
        if (runnerRef.current !== null) window.clearInterval(runnerRef.current);
        runnerRef.current = null;
      }
    };

    // hemen bir dene, sonra aralık kur
    tick();
    runnerRef.current = window.setInterval(tick, STEP);

    // cleanup
    return () => {
      if (runnerRef.current !== null) {
        window.clearInterval(runnerRef.current);
        runnerRef.current = null;
      }
      if (armedGestureRef.current) {
        armedGestureRef.current(); // listener’ları kaldır
        armedGestureRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.length, connected, adapters]); // wallets/adapters hazır olmadan başlamamak için

  return null;
}
