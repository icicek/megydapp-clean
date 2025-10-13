// components/wallet/AutoConnectOnLoad.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
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
  const { publicKey, connect, wallet, select } = useWallet();
  const adapter = wallet?.adapter;

  // UI
  const [showFallbackCTA, setShowFallbackCTA] = useState(false);
  const [connectingNow, setConnectingNow] = useState(false);

  // Locks & timers
  const lockedRef = useRef(false);
  const boundGestureRef = useRef(false);
  const gestureHandlerRef = useRef<((e: Event) => void) | null>(null);
  const cleanupTimersRef = useRef<number[]>([]);

  const sleep = (ms: number) =>
    new Promise<void>((res) => {
      const t = window.setTimeout(() => res(), ms);
      cleanupTimersRef.current.push(t);
    });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ac = params.get('ac') === '1';
    const brand = (params.get('brand') || '').toLowerCase(); // 'phantom'|'solflare'|'backpack'
    if (!ac || publicKey) return;

    // --- 0) Önce hedef cüzdanı select() et (çok kritik) ---
    const desiredName = BRAND_TO_WALLET[brand];
    if (desiredName) {
      const current = wallet?.adapter?.name;
      if (current !== desiredName) {
        try {
          // select tetikleyip adapter'ın oluşmasını bekleyeceğiz
          select(desiredName as WalletName);
          logEvent?.('autoconnect_select_wallet', { brand, to: desiredName });
        } catch (e: any) {
          logEvent?.('autoconnect_select_wallet_error', { brand, message: e?.message || String(e) });
        }
      }
    }

    // Adapter hazır olana kadar kısa bir “poll” (maks 1.2s) — Phantom/Android injection gecikmesi için
    const waitAdapterReady = async () => {
      const maxWait = 1200;
      const step = 120;
      let waited = 0;
      while (waited <= maxWait) {
        const a = ((): typeof adapter => {
          // wallet referansı closure içinde sabit kalmasın diye runtime okuyalım
          const w = (window as any).__lastWalletState?.wallet || wallet; // fallback
          return (w?.adapter ?? adapter) as typeof adapter;
        })();
        const ready =
          a &&
          (a.readyState === WalletReadyState.Installed ||
            a.readyState === WalletReadyState.Loadable);
        if (ready) return true;
        await sleep(step);
        waited += step;
      }
      return false;
    };

    // UA/brand tespiti
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isPhantomUA = /Phantom/i.test(ua) || (window as any)?.solana?.isPhantom === true;
    const isSolflareUA = /Solflare/i.test(ua) || (window as any)?.solflare === true;
    const isPhantomAndroid = isAndroid && (brand === 'phantom' || isPhantomUA);
    const isSolflare = brand === 'solflare' || isSolflareUA;

    const landingDelayMs = isPhantomAndroid ? 600 : 300;

    const clearUrlParams = () => {
      try {
        const newUrl = window.location.pathname + window.location.hash;
        history.replaceState(null, '', newUrl);
      } catch {}
    };

    const doConnect = async (method: AttemptMethod) => {
      if (lockedRef.current || publicKey) return;
      lockedRef.current = true;
      setConnectingNow(true);
      setShowFallbackCTA(false);
      logEvent?.('autoconnect_attempt', { method, brand });

      try {
        const backoffs = isPhantomAndroid ? [400, 800, 1200, 1600] : [250, 600, 1000, 1500];

        await sleep(landingDelayMs);

        // Adapter hazır mı? (select sonrası bekle)
        const ready = await waitAdapterReady();
        if (!ready) {
          logEvent?.('autoconnect_skip', { reason: 'adapter_not_ready_after_select', brand });
        }

        for (let i = 0; i < backoffs.length; i++) {
          if (document.visibilityState !== 'visible') {
            logEvent?.('autoconnect_skip', { reason: 'document_hidden', brand });
            break;
          }

          // Phantom Android: önce sessiz (onlyIfTrusted) — UI açmadan
          if (isPhantomAndroid && method === 'silent_onlyIfTrusted') {
            const provider: any =
              (window as any).solana ||
              (window as any).phantom?.solana ||
              (window as any).window?.solana;

            if (provider?.connect) {
              try {
                await provider.connect({ onlyIfTrusted: true });
                logEvent?.('autoconnect_success', { method, tryIndex: i, brand });
                clearUrlParams();
                setShowFallbackCTA(false);
                setConnectingNow(false);
                lockedRef.current = false;
                return;
              } catch (e: any) {
                logEvent?.('autoconnect_error', {
                  method,
                  tryIndex: i,
                  brand,
                  message: e?.message || String(e),
                });
              }
            }
            // Sessiz deneme tek hakkımız — gesture’a bırak
            break;
          }

          try {
            const a = ((): typeof adapter => wallet?.adapter ?? adapter)();
            if (a?.connect) {
              await a.connect();
            } else if (connect) {
              await connect();
            } else {
              throw new Error('no-adapter-or-connect');
            }

            logEvent?.('autoconnect_success', { method, tryIndex: i, brand });
            clearUrlParams();
            setShowFallbackCTA(false);
            setConnectingNow(false);
            lockedRef.current = false;
            return;
          } catch (e: any) {
            logEvent?.('autoconnect_error', {
              method,
              tryIndex: i,
              brand,
              message: e?.message || String(e),
            });
            await sleep(backoffs[i]);
          }
        }

        // Başarısız → CTA
        setShowFallbackCTA(true);
      } finally {
        setConnectingNow(false);
        lockedRef.current = false;
      }
    };

    // --- Strateji ---
    // 1) Phantom Android → önce sessiz onlyIfTrusted (UI açmadan)
    if (isPhantomAndroid) {
      doConnect('silent_onlyIfTrusted');
    } else {
      // 2) Solflare & diğerleri → immediate
      doConnect('immediate');
    }

    // 3) İlk gesture’da dene
    if (!boundGestureRef.current) {
      const onFirstGesture = () => {
        if (gestureHandlerRef.current) {
          window.removeEventListener('pointerdown', gestureHandlerRef.current);
          window.removeEventListener('touchstart', gestureHandlerRef.current);
        }
        boundGestureRef.current = false;
        doConnect('gesture');
      };
      gestureHandlerRef.current = onFirstGesture;
      window.addEventListener('pointerdown', onFirstGesture, { once: true });
      window.addEventListener('touchstart', onFirstGesture, { once: true });
      boundGestureRef.current = true;

      // 7s sonra hâlâ yoksa CTA
      const t = window.setTimeout(() => {
        if (!publicKey) {
          logEvent?.('autoconnect_timeout', { brand });
          setShowFallbackCTA(true);
        }
      }, 7000);
      cleanupTimersRef.current.push(t);
    }

    // 4) görünür olduğunda (ör. uygulamalar arasında geçişte) yeniden fırsat
    const onVisible = () => {
      if (!publicKey && !lockedRef.current) {
        if (isPhantomAndroid) return; // Phantom genelde gesture istiyor
        doConnect('immediate');
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // küçük: runtime’da wallet durumunu kaydet (waitAdapterReady için)
    (window as any).__lastWalletState = { wallet };

    return () => {
      if (gestureHandlerRef.current) {
        window.removeEventListener('pointerdown', gestureHandlerRef.current);
        window.removeEventListener('touchstart', gestureHandlerRef.current);
      }
      document.removeEventListener('visibilitychange', onVisible);
      cleanupTimersRef.current.forEach((t) => window.clearTimeout(t));
      cleanupTimersRef.current = [];
    };
  }, [wallet, adapter, publicKey, connect, select]);

  if (publicKey) return null;

  // CTA: tek dokunuşla dene
  return showFallbackCTA ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <button
        disabled={connectingNow}
        onClick={() => {
          const brand = (new URLSearchParams(window.location.search).get('brand') || '').toLowerCase();
          logEvent?.('autoconnect_manual_retry_click', { brand });
          document.dispatchEvent(new Event('pointerdown')); // gesture akışını tetikle
        }}
        className="px-4 py-2 rounded-lg shadow-md bg-indigo-600 text-white font-semibold disabled:opacity-60"
      >
        {connectingNow ? 'Connecting…' : 'Tap once to connect'}
      </button>
    </div>
  ) : null;
}
