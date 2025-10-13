// components/wallet/AutoConnectOnLoad.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { logEvent } from '@/lib/analytics';

type AttemptMethod = 'immediate' | 'gesture' | 'manual' | 'silent_onlyIfTrusted';

export default function AutoConnectOnLoad() {
  const { publicKey, connect, wallet } = useWallet();
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
    const brand = (params.get('brand') || '').toLowerCase(); // 'phantom' | 'solflare' | 'backpack' ...
    if (!ac || publicKey) return;

    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isPhantomUA = /Phantom/i.test(ua) || (window as any)?.solana?.isPhantom === true;
    const isSolflareUA = /Solflare/i.test(ua) || (window as any)?.solflare === true;

    // Brand/UA tabanlı ayarlar
    const isPhantomAndroid = isAndroid && (brand === 'phantom' || isPhantomUA);
    const isSolflare = brand === 'solflare' || isSolflareUA;

    // Phantom Android'de injection geç gelebilir → immediate denemeyi kapat, gesture'a bırak.
    // Solflare'de immediate + backoff kalabilir.
    const landingDelayMs = isPhantomAndroid ? 500 : 300;

    const adapterReady =
      adapter &&
      (adapter.readyState === WalletReadyState.Installed ||
        adapter.readyState === WalletReadyState.Loadable);

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
        // Backoff adımları
        const backoffs = isPhantomAndroid ? [400, 800, 1200, 1600] : [250, 600, 1000, 1500];

        await sleep(landingDelayMs);

        for (let i = 0; i < backoffs.length; i++) {
          if (document.visibilityState !== 'visible') {
            logEvent?.('autoconnect_skip', { reason: 'document_hidden', brand });
            break;
          }

          // Phantom Android: immediate yerine gesture’da connect, ama sessiz denemeyi bir kez yapacağız (aşağıda).
          const canImmediateTry = !isPhantomAndroid;

          try {
            if (isPhantomAndroid && method === 'silent_onlyIfTrusted') {
              // UI açmadan sessiz bağlanma denemesi: daha önce trust verilmişse başarılı olur
              const provider: any =
                (window as any).solana ||
                (window as any).phantom?.solana ||
                (window as any).window?.solana;

              if (provider?.connect) {
                try {
                  await provider.connect({ onlyIfTrusted: true });
                  logEvent?.('autoconnect_success', { method, tryIndex: i, brand });
                  clearUrlParams();
                  setConnectingNow(false);
                  lockedRef.current = false;
                  setShowFallbackCTA(false);
                  return;
                } catch (e: any) {
                  // Sessiz deneme başarısız → gesture’a geçilecek
                  logEvent?.('autoconnect_error', {
                    method,
                    tryIndex: i,
                    brand,
                    message: e?.message || String(e),
                  });
                }
              }
              // Sessiz deneme yaptıktan sonra döngüden çık (gesture akışına bırak)
              break;
            }

            if ((canImmediateTry && method === 'immediate') || method === 'gesture' || method === 'manual') {
              if (adapter?.connect) {
                await adapter.connect();
              } else if (connect) {
                await connect();
              } else {
                throw new Error('no-adapter-or-connect');
              }

              logEvent?.('autoconnect_success', { method, tryIndex: i, brand });
              clearUrlParams();
              setConnectingNow(false);
              lockedRef.current = false;
              setShowFallbackCTA(false);
              return;
            }

            // Aksi halde biraz bekle ve tekrar döngüle
            await sleep(backoffs[i]);
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
    // 1) Phantom Android → önce SESSİZ (onlyIfTrusted) — UI yok.
    if (isPhantomAndroid) {
      doConnect('silent_onlyIfTrusted');
    } else if (adapterReady) {
      // 2) Diğerleri (özellikle Solflare) → immediate dene
      doConnect('immediate');
    }

    // 3) İlk gesture’da dene (Phantom Android’de asıl yol bu)
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

      // 7s sonra hâlâ yoksa CTA göster
      const t = window.setTimeout(() => {
        if (!publicKey) {
          logEvent?.('autoconnect_timeout', { brand });
          setShowFallbackCTA(true);
        }
      }, 7000);
      cleanupTimersRef.current.push(t);
    }

    // 4) Sayfa görünür olduğunda tekrar şans (özellikle app switch sonrası)
    const onVisible = () => {
      if (!publicKey && !lockedRef.current) {
        if (isPhantomAndroid) {
          // görünür olunca gesture bekleyelim; Phantom genelde gesture ister
          return;
        }
        if (adapterReady) doConnect('immediate');
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (gestureHandlerRef.current) {
        window.removeEventListener('pointerdown', gestureHandlerRef.current);
        window.removeEventListener('touchstart', gestureHandlerRef.current);
      }
      document.removeEventListener('visibilitychange', onVisible);
      cleanupTimersRef.current.forEach((t) => window.clearTimeout(t));
      cleanupTimersRef.current = [];
    };
  }, [wallet, adapter, publicKey, connect]);

  if (publicKey) return null;

  // CTA: tek dokunuşla dene
  return showFallbackCTA ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <button
        disabled={connectingNow}
        onClick={() => {
          const brand = (new URLSearchParams(window.location.search).get('brand') || '').toLowerCase();
          logEvent?.('autoconnect_manual_retry_click', { brand });
          // manual → gesture semantiği
          document.dispatchEvent(new Event('pointerdown'));
        }}
        className="px-4 py-2 rounded-lg shadow-md bg-indigo-600 text-white font-semibold disabled:opacity-60"
      >
        {connectingNow ? 'Connecting…' : 'Tap once to connect'}
      </button>
    </div>
  ) : null;
}
