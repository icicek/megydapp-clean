// components/wallet/ResetSmartConnectOnReturn.tsx
'use client';

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { logEvent } from '@/lib/analytics';

function isWalletInAppUA() {
  const ua = navigator.userAgent || '';
  if (/Phantom|Solflare|Backpack|xNFT/i.test(ua)) return true;
  if ((window as any)?.solana?.isPhantom) return true;
  if ((window as any)?.solflare) return true;
  if ((window as any)?.backpack) return true;
  return false;
}

export default function ResetSmartConnectOnReturn() {
  const { disconnect, wallet } = useWallet();

  async function resetFlow(reason: string) {
    try {
      // URL query temizliği
      const u = new URL(window.location.href);
      if (u.searchParams.has('ac') || u.searchParams.has('brand')) {
        u.searchParams.delete('ac');
        u.searchParams.delete('brand');
        history.replaceState(null, '', u.pathname + u.hash);
      }

      // Uçuş ve geçici anahtarlar
      const KEYS = [
        'sc:flight', 'sc:brand', 'sc:ac', 'sc:inProgress',
        'wallethub:lastBrand', 'wallethub:lastChain',
      ];
      KEYS.forEach(k => {
        try { localStorage.removeItem(k); } catch {}
        try { sessionStorage.removeItem(k); } catch {}
      });

      // Bağlıysa sessiz disconnect
      try { await wallet?.adapter?.disconnect?.(); } catch {}
      try { await disconnect?.(); } catch {}

      // Modal/Connect bileşenlerine sinyal
      try { window.dispatchEvent(new CustomEvent('smartconnect:reset')); } catch {}

      logEvent?.('smart_connect_reset_on_return', { reason });
    } catch { /* no-op */ }
  }

  useEffect(() => {
    const handler = () => {
      // Dış tarayıcıya dönmüş ve görünürsek resetle
      if (document.visibilityState !== 'visible') return;
      if (isWalletInAppUA()) return;

      // Önceden bir uçuş işareti varsa reset
      const flight = localStorage.getItem('sc:flight');
      if (flight) resetFlow('external_browser_return');
    };

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
