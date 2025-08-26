'use client';

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export default function AdminSessionSync() {
  const { publicKey, connected } = useWallet();

  // Cüzdan değişince veya bağlantı kesilince admin oturumunu senkronla
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return; // aktif admin oturumu yoksa yapacak iş yok

        const { wallet: adminWallet } = await res.json();
        const current = publicKey?.toBase58() || null;

        // 1) Wallet disconnect → oturumu kapat
        // 2) Bağlı wallet != admin cookie’deki wallet → oturumu kapat
        if (!connected || !current || (adminWallet && adminWallet !== current)) {
          await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' });
        }
      } catch {
        // yut
      }
    })();
  }, [publicKey, connected]);

  // Sekme odaklanınca da tekrar kontrol et (multi-tab senaryoları için)
  useEffect(() => {
    const onFocus = async () => {
      try {
        const res = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const { wallet: adminWallet } = await res.json();
        const current = publicKey?.toBase58() || null;
        if (!connected || !current || (adminWallet && adminWallet !== current)) {
          await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' });
        }
      } catch {}
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [publicKey, connected]);

  return null;
}

export {};
