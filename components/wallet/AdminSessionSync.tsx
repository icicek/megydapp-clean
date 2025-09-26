'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePathname } from 'next/navigation';

export default function AdminSessionSync() {
  const { publicKey, connected, connecting } = useWallet();
  const pathname = usePathname();
  const busyRef = useRef(false); // eşzamanlı istekleri engelle

  // Sadece /admin altında çalıştır (globalde gereksiz fetch'leri önler)
  const enabled = pathname?.startsWith('/admin');

  async function checkAndSync() {
    if (!enabled) return;
    if (connecting) return; // bağlanma sürerken asla dokunma (yarışları önler)
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return; // aktif admin oturumu yoksa çık
      const { wallet: adminWallet } = await res.json();
      const current = publicKey?.toBase58() || null;

      // 1) disconnect olduysa
      // 2) cüzdan değiştiyse (cookie'deki ≠ mevcut)
      if (!connected || !current || (adminWallet && adminWallet !== current)) {
        await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' });
      }
    } catch {
      // yut
    } finally {
      busyRef.current = false;
    }
  }

  // cüzdan durumu değişince
  useEffect(() => {
    checkAndSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, connected, publicKey, connecting]);

  // sekme odağı/visibility değişiminde
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => { if (document.visibilityState === 'visible') checkAndSync(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') checkAndSync(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  return null;
}
