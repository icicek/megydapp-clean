// components/wallet/AutoConnectOnLoad.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { logEvent } from '@/lib/analytics';

type AttemptMethod = 'immediate' | 'gesture' | 'manual';

export default function AutoConnectOnLoad() {
  const { publicKey, connect, wallet } = useWallet();
  const adapter = wallet?.adapter;

  // Guards & UI
  const [showFallbackCTA, setShowFallbackCTA] = useState(false);
  const [connectingNow, setConnectingNow] = useState(false);

  // Locks & timers
  const lockedRef = useRef(false);
  const boundGestureRef = useRef(false);
  const gestureHandlerRef = useRef<((e: Event) => void) | null>(null);
  const cleanupTimersRef = useRef<number[]>([]);

  // Helpers
  const sleep = (ms: number) =>
    new Promise<void>((res) => {
      const t = window.setTimeout(() => res(), ms);
      cleanupTimersRef.current.push(t);
    });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ac = params.get('ac') === '1';
    const brand = params.get('brand') || null;

    // In-app’a yeni inişte küçük bir gecikme (injection hazır olsun)
    const landingDelayMs = 300;

    if (!ac || publicKey) return;

    const isDomVisible = () => document.visibilityState === 'visible';
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
        // Toplamda 4 deneme: 250 → 600 → 1000 → 1500 ms
        const backoffs = [250, 600, 1000, 1500];

        // Landing delay (özellikle in-app geçişlerinden hemen sonra)
        await sleep(landingDelayMs);

        for (let i = 0; i < backoffs.length; i++) {
          // Görünür değilken veya adapter hazır değilken deneme yapma
          if (!isDomVisible()) {
            logEvent?.('autoconnect_skip', { reason: 'document_hidden', brand });
            break;
          }
          if (!adapterReady) {
            logEvent?.('autoconnect_skip', { reason: 'adapter_not_ready', i, brand });
            await sleep(backoffs[i]);
            continue;
          }

          try {
            if (adapter?.connect) {
              await adapter.connect();
            } else if (connect) {
              await connect();
            } else {
              throw new Error('no-adapter-or-connect');
            }

            // Başarılı
            logEvent?.('autoconnect_success', { method, tryIndex: i, brand });
            clearUrlParams();
            setConnectingNow(false);
            lockedRef.current = false;
            setShowFallbackCTA(false);
            return;
          } catch (e: any) {
            // Bazı cüzdanlar gesture/odak/izin yüzünden ilk denemede atar; backoff ile sür
            logEvent?.('autoconnect_error', {
              method,
              tryIndex: i,
              brand,
              message: e?.message || String(e),
            });
            await sleep(backoffs[i]);
          }
        }

        // Buraya düştüyse başarısız — CTA göster
        setShowFallbackCTA(true);
      } finally {
        setConnectingNow(false);
        lockedRef.current = false;
      }
    };

    // 1) Şartlar uygunsa “immediate” dene (gesture gerekmeyebilir)
    if (adapterReady) {
      doConnect('immediate');
    }

    // 2) İlk kullanıcı etkileşimine bağla (gesture gerekirse)
    if (!boundGestureRef.current) {
      const onFirstGesture = () => {
        // unbind
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

      // 7s sonra hâlâ bağlanamadıysa CTA’yı aç
      const t = window.setTimeout(() => {
        if (!publicKey) {
          logEvent?.('autoconnect_timeout', { brand });
          setShowFallbackCTA(true);
        }
      }, 7000);
      cleanupTimersRef.current.push(t);
    }

    return () => {
      // Temizle
      if (gestureHandlerRef.current) {
        window.removeEventListener('pointerdown', gestureHandlerRef.current);
        window.removeEventListener('touchstart', gestureHandlerRef.current);
      }
      cleanupTimersRef.current.forEach((t) => window.clearTimeout(t));
      cleanupTimersRef.current = [];
    };
  }, [wallet, adapter, publicKey, connect]);

  // Zaten bağlıysa görünme
  if (publicKey) return null;

  // Fallback CTA (tek dokunuşla dene)
  return showFallbackCTA ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <button
        disabled={connectingNow}
        onClick={() => {
          const brand = new URLSearchParams(window.location.search).get('brand') || null;
          logEvent?.('autoconnect_manual_retry_click', { brand });
          // manual = gesture semantiğine yakın; tek sefer daha deneyelim
          // Not: doConnect’i effect dışına taşımamak için gesture event’ini tetikleyecek basit bir yol:
          document.dispatchEvent(new Event('pointerdown'));
        }}
        className="px-4 py-2 rounded-lg shadow-md bg-indigo-600 text-white font-semibold disabled:opacity-60"
      >
        {connectingNow ? 'Connecting…' : 'Tap once to connect'}
      </button>
    </div>
  ) : null;
}
