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
  const [needsFirstTap, setNeedsFirstTap] = useState(false); // 👈 Phantom Android gate

  const lockedRef = useRef(false);
  const cleanupTimersRef = useRef<number[]>([]);

  const sleep = (ms: number) =>
    new Promise<void>((res) => {
      const t = window.setTimeout(() => res(), ms);
      cleanupTimersRef.current.push(t);
    });

  const clearUrlParams = useCallback(() => {
    try {
      const newUrl = window.location.pathname + window.location.hash;
      history.replaceState(null, '', newUrl);
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
    const isSolflareUA = /Solflare/i.test(ua) || (window as any)?.solflare === true;

    const isPhantomAndroid = isAndroid && (brand === 'phantom' || isPhantomUA);
    const isSolflare = brand === 'solflare' || isSolflareUA;

    // 0) Ensure target wallet selected (critical)
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
      !!(wallet?.adapter &&
        (wallet.adapter.readyState === WalletReadyState.Installed ||
          wallet.adapter.readyState === WalletReadyState.Loadable));

    const doConnect = async (method: AttemptMethod) => {
      if (lockedRef.current || publicKey) return;
      lockedRef.current = true;
      setConnecting(true);
      setShowFallbackCTA(false);
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
        clearUrlParams();
        setNeedsFirstTap(false);
      } catch (e: any) {
        logEvent?.('autoconnect_error', { method, brand, message: e?.message || String(e) });
        // Show fallback for non-Phantom or later manual retry
        setShowFallbackCTA(true);
      } finally {
        setConnecting(false);
        lockedRef.current = false;
      }
    };

    const trySilentIfTrusted = async () => {
      // Phantom provider (window.solana) direct silent connect
      const provider: any =
        (window as any).solana ||
        (window as any).phantom?.solana ||
        (window as any).window?.solana;

      if (!provider?.connect) return false;
      try {
        logEvent?.('autoconnect_attempt', { method: 'silent_onlyIfTrusted', brand });
        await provider.connect({ onlyIfTrusted: true });
        logEvent?.('autoconnect_success', { method: 'silent_onlyIfTrusted', brand });
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
      // Small landing delay for in-app injection stabilization
      const landingDelay = isPhantomAndroid ? 600 : 300;
      await sleep(landingDelay);

      // Wait briefly for adapter readiness after select()
      const maxWait = 1200;
      const step = 120;
      let waited = 0;
      while (waited <= maxWait && !adapterReady()) {
        await sleep(step);
        waited += step;
      }

      if (isPhantomAndroid) {
        // 1) Silent (onlyIfTrusted). If user trusted before, this auto-connects.
        const ok = await trySilentIfTrusted();
        if (ok) return;

        // 2) Otherwise, require a REAL first tap (not programmatic).
        // Render a full-screen tap-catcher so any tap counts as a proper gesture.
        setNeedsFirstTap(true);
        setShowFallbackCTA(false);
        logEvent?.('autoconnect_waiting_first_tap', { brand: 'phantom' });
        return;
      }

      // Non-Phantom (e.g., Solflare) — immediate try with light backoff
      const backoffs = [250, 600, 1000];
      for (let i = 0; i < backoffs.length; i++) {
        if (document.visibilityState !== 'visible') break;
        try {
          await doConnect('immediate');
          return;
        } catch {
          // doConnect already logs; wait and retry
        }
        await sleep(backoffs[i]);
      }

      setShowFallbackCTA(true);
    })();

    return () => {
      cleanupTimersRef.current.forEach((t) => window.clearTimeout(t));
      cleanupTimersRef.current = [];
    };
  }, [publicKey, wallet, adapter, connect, select, clearUrlParams]);

  // Already connected — render nothing
  if (publicKey) return null;

  // 🛡 Phantom Android First-Tap Gate: full-screen transparent button
  if (needsFirstTap) {
    const onFirstTap = async () => {
      if (lockedRef.current) return;
      setConnecting(true);
      lockedRef.current = true;
      logEvent?.('autoconnect_first_tap', { brand: 'phantom' });
      try {
        // Connect INSIDE the real user gesture handler
        const a = wallet?.adapter ?? adapter;
        if (a?.connect) {
          await a.connect();
        } else if (connect) {
          await connect();
        } else {
          throw new Error('no-adapter-or-connect');
        }
        logEvent?.('autoconnect_success', { method: 'gesture', brand: 'phantom' });
        clearUrlParams();
        setNeedsFirstTap(false);
      } catch (e: any) {
        logEvent?.('autoconnect_error', {
          method: 'gesture',
          brand: 'phantom',
          message: e?.message || String(e),
        });
        // Keep the gate so user can try again; also show a visible CTA pill
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
        // Transparent full-screen catcher
        style={{ background: 'transparent' }}
      >
        {/* Small visible hint at bottom */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 shadow-md bg-black/60 text-white text-sm font-semibold">
          {connecting ? 'Connecting…' : 'Tap once to connect with Phantom'}
        </div>
      </button>
    );
  }

  // Generic small CTA (for non-Phantom or retries)
  return showFallbackCTA ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <button
        disabled={connecting}
        onClick={() => {
          // Use a REAL click to trigger connect (non-Phantom paths benefit too)
          const el = document.activeElement as HTMLElement | null;
          el?.blur?.();
          // Call connect directly here (real gesture)
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
