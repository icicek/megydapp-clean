// components/wallet/AutoConnectOnLoad.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { logEvent } from '@/lib/analytics'; // yolunu projene göre koru

export default function AutoConnectOnLoad() {
  const { publicKey, connect, wallet } = useWallet();
  const adapter = wallet?.adapter; // ✅ DOĞRU: adapter buradan gelir

  const triedRef = useRef(false);
  const gestureBoundRef = useRef(false);
  const gestureHandlerRef = useRef<((e: Event) => void) | null>(null);
  const [showFallbackCTA, setShowFallbackCTA] = useState(false);

  useEffect(() => {
    // URL paramlarını effect içinde oku (SSR uyumlu)
    const params = new URLSearchParams(window.location.search);
    const ac = params.get('ac') === '1';
    const brand = params.get('brand') || null;

    if (!ac) return;
    if (triedRef.current) return;

    let timeoutHandle: number | undefined;

    async function attemptAutoConnect(reason: 'immediate' | 'gesture') {
      if (triedRef.current) return;
      triedRef.current = true;
      logEvent?.('autoconnect_attempt', { method: reason, brand });

      try {
        if (adapter?.connect) {
          await adapter.connect(); // çoğu cüzdan için gesture gerekebilir
        } else if (connect) {
          await connect(); // wallet-adapter fallback
        } else {
          throw new Error('no-adapter-or-connect');
        }

        logEvent?.('autoconnect_success', { method: reason, brand });

        // ✅ Başarı sonrası ?ac & brand paramlarını temizle
        try {
          const newUrl = window.location.pathname + window.location.hash;
          history.replaceState(null, '', newUrl);
        } catch {}

        setShowFallbackCTA(false);
        return;
      } catch (err: any) {
        console.warn('autoconnect failed', err);
        logEvent?.('autoconnect_error', {
          method: reason,
          brand,
          message: err?.message || String(err),
        });

        // kısa gecikme sonrası görünür CTA
        timeoutHandle = window.setTimeout(() => setShowFallbackCTA(true), 600);
      }
    }

    // 1) Adapter zaten hazırsa hemen dene
    if (adapter && (adapter as any).connected !== undefined) {
      attemptAutoConnect('immediate');
    }

    // 2) Değilse ilk kullanıcı etkileşimine bağla (gesture)
    if (!gestureBoundRef.current) {
      const onFirstGesture = (e: Event) => {
        // unbind
        if (gestureHandlerRef.current) {
            window.removeEventListener('pointerdown', gestureHandlerRef.current);
            window.removeEventListener('touchstart', gestureHandlerRef.current);
          }
          gestureBoundRef.current = false;
        attemptAutoConnect('gesture');
      };
      gestureHandlerRef.current = onFirstGesture;
      window.addEventListener('pointerdown', onFirstGesture, { once: true });
      window.addEventListener('touchstart', onFirstGesture, { once: true });
      gestureBoundRef.current = true;

      // 6s güvenlik süresi
      timeoutHandle = window.setTimeout(() => {
        if (!triedRef.current) {
          logEvent?.('autoconnect_timeout', { brand });
          setShowFallbackCTA(true);
        }
      }, 6000);
    }

    return () => {
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      if (gestureHandlerRef.current) {
        window.removeEventListener('pointerdown', gestureHandlerRef.current);
        window.removeEventListener('touchstart', gestureHandlerRef.current);
      }
    };
  }, [wallet, adapter, connect]);

  if (publicKey) return null; // zaten bağlı
  // ?ac=1 yoksa da görünme — minimal davranış
  // (CTA yalnızca timeout veya hata sonrasında çıkacak)

  return (
    <>
      {showFallbackCTA && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={async () => {
              const brand = new URLSearchParams(window.location.search).get('brand') || null;
              logEvent?.('autoconnect_manual_retry', { brand });
              try {
                if (adapter?.connect) {
                  await adapter.connect();
                } else if (connect) {
                  await connect();
                } else {
                  throw new Error('no-adapter-or-connect');
                }
                logEvent?.('autoconnect_success_manual', { brand });
                try {
                  const newUrl = window.location.pathname + window.location.hash;
                  history.replaceState(null, '', newUrl);
                } catch {}
              } catch (e: any) {
                console.warn('manual retry failed', e);
                logEvent?.('autoconnect_error_manual', {
                  brand,
                  message: e?.message || String(e),
                });
              }
            }}
            className="px-4 py-2 rounded-lg shadow-md bg-indigo-600 text-white font-semibold"
          >
            Tap once to connect
          </button>
        </div>
      )}
    </>
  );
}
