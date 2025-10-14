'use client';

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { logEvent } from '@/lib/analytics';

function isWalletInAppUA() {
  const ua = navigator.userAgent;
  // Phantom/Solflare/Backpack in-app tarayıcı sinyalleri
  if (/Phantom/i.test(ua) || /Solflare/i.test(ua) || /Backpack/i.test(ua)) return true;
  // Bazı cüzdanlar window işaretleri bırakır
  if ((window as any)?.solana?.isPhantom) return true;
  if ((window as any)?.solflare) return true;
  if ((window as any)?.backpack) return true;
  return false;
}

export default function ResetSmartConnectOnReturn() {
  const { disconnect, wallet } = useWallet();

  async function resetFlow(reason: string) {
    try {
      // URL'den ?ac & ?brand paramlarını kaldır
      const url = new URL(window.location.href);
      if (url.searchParams.has('ac') || url.searchParams.has('brand')) {
        url.searchParams.delete('ac');
        url.searchParams.delete('brand');
        history.replaceState(null, '', url.pathname + url.hash);
      }

      // Local/session izlerini temizle
      const KEYS = [
        'sc:flight',                // bu akış için ekleyeceğiz (aşağıya bkz.)
        'sc:brand',
        'sc:ac',
        'sc:inProgress',
        'wallethub:lastBrand',
        'wallethub:lastChain',
      ];
      KEYS.forEach((k) => {
        try { localStorage.removeItem(k); } catch {}
        try { sessionStorage.removeItem(k); } catch {}
      });

      // Bağlı değilsek no-op; bağlıysa sessizce kopar
      try { await wallet?.adapter?.disconnect?.(); } catch {}
      try { await disconnect?.(); } catch {}

      // UI’lara haber vermek istersen:
      try { window.dispatchEvent(new CustomEvent('smartconnect:reset')); } catch {}

      logEvent?.('smart_connect_reset_on_return', { reason });
    } catch (e: any) {
      // Sessiz geç
    }
  }

  useEffect(() => {
    const handler = () => {
      // Sayfa görünür ve dış tarayıcıdaysak resetle
      if (document.visibilityState !== 'visible') return;
      if (isWalletInAppUA()) return;

      // Bir önceki adımda bir cüzdan tarayıcısına gittiğimizi işaretlediysek (sc:flight),
      // ve şimdi dış tarayıcıya geri döndüysek → reset
      const flight = localStorage.getItem('sc:flight');
      if (flight) resetFlow('external_browser_return');
    };

    // Hem BFCache dönüşü hem app-switch senaryoları
    window.addEventListener('pageshow', handler);
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);

    return () => {
      window.removeEventListener('pageshow', handler);
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [disconnect, wallet]);

  return null;
}
