// components/wallet/AutoConnectOnLoad.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletName, WalletReadyState } from '@solana/wallet-adapter-base';
import { logEvent } from '@/lib/analytics';

type AttemptMethod = 'immediate' | 'gesture' | 'manual' | 'silent_onlyIfTrusted';

const BRAND_TO_WALLET: Record<string, WalletName | string> = {
  phantom: 'Phantom',
  solflare: 'Solflare',
  backpack: 'Backpack',
};

export default function AutoConnectOnLoad() {
  const { publicKey, wallet, connect, select } = useWallet();
  const adapter = wallet?.adapter;

  const [showFallbackCTA, setShowFallbackCTA] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [needsFirstTap, setNeedsFirstTap] = useState(false); // Phantom Android gate

  const lockedRef = useRef(false);
  const cleanupTimersRef = useRef<number[]>([]);

  const sleep = (ms: number) =>
    new Promise<void>((res) => {
      const t = window.setTimeout(() => res(), ms);
      cleanupTimersRef.current.push(t);
    });

  const clearUrlParams = useCallback(() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('ac');
      u.searchParams.delete('brand');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch {}
  }, []);

  useEffect(() => {
    if (publicKey) return;

    const params = new URLSearchParams(window.location.search);
    const ac = params.get('ac') === '1';
    const brand = (params.get('brand') || '').toLowerCase();
    if (!ac) return;

    // UA & brand detection
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isPhantomUA = /Phantom/i.test(ua) || (window as any)?.solana?.isPhantom === true;

    const isPhantomAndroid = isAndroid && (brand === 'phantom' || isPhantomUA);

    // 0) Hedef cüzdanı select et (kritik)
    const desiredName = BRAND_TO_WALLET[brand];
    if (desiredName && wallet?.adapter?.name !== desiredName) {
      try {
        select(desiredName as WalletName);
        logEvent?.('autoconnect_select_wallet', { brand, to: desiredName });
      } catch (e: any) {
        logEvent?.('autoconnect_select_wallet_error', { brand, message: e?.message || String(e) });
      }
    }

    const adapterReady = () =>
      !!(
        wallet?.adapter &&
        (wallet.adapter.readyState === WalletReadyState.Installed ||
          wallet.adapter.readyState === WalletReadyState.Loadable)
      );

    // Tek denemelik connect çağrısı; başarı/başarısızlık bilgisini döndürür
    const doConnect = async (method: AttemptMethod): Promise<boolean> => {
      if (lockedRef.current || publicKey) return false;
      lockedRef.current = true;
      setConnecting(true);
      logEvent?.('autoconnect_attempt', { method, brand });

      try {
        const a = wallet?.adapter ?? adapter;
        if (a?.connect) {
          await a.connect();
        } else if (connect) {
          await connect();
        } else {
          throw new Error('no-adapter-or-connect');
        }
        logEvent?.('autoconnect_success', { method, brand });
        try { localStorage.removeItem('sc:flight'); } catch {}
        clearUrlParams();
        setNeedsFirstTap(false);
        return true;
      } catch (e: any) {
        logEvent?.('autoconnect_error', { method, brand, message: e?.message || String(e) });
        return false;
      } finally {
        setConnecting(false);
        lockedRef.current = false;
      }
    };

    // Phantom için sessiz (onlyIfTrusted) deneme
    const trySilentIfTrusted = async (): Promise<boolean> => {
      const provider: any =
        (window as any).solana ||
        (window as any).phantom?.solana;

      if (!provider?.connect) return false;
      try {
        logEvent?.('autoconnect_attempt', { method: 'silent_onlyIfTrusted', brand });
        await provider.connect({ onlyIfTrusted: true });
        logEvent?.('autoconnect_success', { method: 'silent_onlyIfTrusted', brand });
        try { localStorage.removeItem('sc:flight'); } catch {}
        clearUrlParams();
        return true;
      } catch (e: any) {
        logEvent?.('autoconnect_error', {
          method: 'silent_onlyIfTrusted',
          brand,
          message: e?.message || String(e),
        });
        return false;
      }
    };

    (async () => {
      // In-app injection stabilizasyonu
      const landingDelay = isPhantomAndroid ? 600 : 300;
      await sleep(landingDelay);

      // select() sonrası kısa bekleme ile adapter hazır olana kadar yokla (maks 1.2s)
      const maxWait = 1200;
      const step = 120;
      let waited = 0;
      while (waited <= maxWait && !adapterReady()) {
        await sleep(step);
        waited += step;
      }

      if (isPhantomAndroid) {
        // 1) Sessiz dene
        const ok = await trySilentIfTrusted();
        if (ok) return;

        // 2) İlk gerçek dokunuşu bekle
        setNeedsFirstTap(true);
        setShowFallbackCTA(false);
        logEvent?.('autoconnect_waiting_first_tap', { brand: 'phantom' });
        return;
      }

      // Non-Phantom (örn. Solflare) — immediate + hafif backoff
      const backoffs = [250, 600, 1000];
      for (let i = 0; i < backoffs.length; i++) {
        if (document.visibilityState !== 'visible') break;
        const ok = await doConnect('immediate');
        if (ok) return;
        await sleep(backoffs[i]);
      }
      setShowFallbackCTA(true);
    })();

    return () => {
      cleanupTimersRef.current.forEach((t) => window.clearTimeout(t));
      cleanupTimersRef.current = [];
    };
  }, [publicKey, wallet, adapter, connect, select, clearUrlParams]);

  // Zaten bağlıysa render etme
  if (publicKey) return null;

  // 🛡 Phantom Android First-Tap Gate
  if (needsFirstTap) {
    const onFirstTap = async () => {
      if (lockedRef.current) return;
      setConnecting(true);
      lockedRef.current = true;
      logEvent?.('autoconnect_first_tap', { brand: 'phantom' });
      try {
        const a = wallet?.adapter ?? adapter;
        if (a?.connect) {
          await a.connect();
        } else if (connect) {
          await connect();
        } else {
          throw new Error('no-adapter-or-connect');
        }
        logEvent?.('autoconnect_success', { method: 'gesture', brand: 'phantom' });
        try { localStorage.removeItem('sc:flight'); } catch {}
        clearUrlParams();
        setNeedsFirstTap(false);
      } catch (e: any) {
        logEvent?.('autoconnect_error', {
          method: 'gesture',
          brand: 'phantom',
          message: e?.message || String(e),
        });
        setShowFallbackCTA(true);
      } finally {
        setConnecting(false);
        lockedRef.current = false;
      }
    };

    return (
      <button
        onClick={onFirstTap}
        className="fixed inset-0 z-[1000] cursor-pointer"
        aria-label="Tap to connect"
        style={{ background: 'transparent' }}
      >
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 shadow-md bg-black/60 text-white text-sm font-semibold">
          {connecting ? 'Connecting…' : 'Tap once to connect with Phantom'}
        </div>
      </button>
    );
  }

  // Generic small CTA (non-Phantom veya retry)
  return showFallbackCTA ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <button
        disabled={connecting}
        onClick={() => {
          const el = document.activeElement as HTMLElement | null;
          el?.blur?.();
          (async () => {
            const params = new URLSearchParams(window.location.search);
            const brand = (params.get('brand') || '').toLowerCase();
            logEvent?.('autoconnect_manual_retry_click', { brand });
            try {
              const a = wallet?.adapter ?? adapter;
              if (a?.connect) {
                await a.connect();
              } else if (connect) {
                await connect();
              } else {
                throw new Error('no-adapter-or-connect');
              }
              logEvent?.('autoconnect_success', { method: 'manual', brand });
              try { localStorage.removeItem('sc:flight'); } catch {}
              clearUrlParams();
              setShowFallbackCTA(false);
            } catch (e: any) {
              logEvent?.('autoconnect_error', { method: 'manual', brand, message: e?.message || String(e) });
            }
          })();
        }}
        className="px-4 py-2 rounded-lg shadow-md bg-indigo-600 text-white font-semibold disabled:opacity-60"
      >
        {connecting ? 'Connecting…' : 'Tap once to connect'}
      </button>
    </div>
  ) : null;
}
