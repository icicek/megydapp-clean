// components/wallet/AdminSessionSync.tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Admin kimliği API'niz hangi alanları döndürüyorsa burayı genişletebilirsiniz
type WhoAmI = {
  adminWallet?: string;
  roles?: string[];
  [k: string]: unknown;
};

/**
 * /admin rotalarında bir kez "kimim" pingi yapar.
 * - 401 (yetkisiz) durumunu NORMAL kabul eder ve sessizce yutar.
 * - Production'da konsolu kirletmez.
 * - Cüzdan bağlama akışını etkilemesin diye asla redirect/refresh tetiklemez.
 * - İsterseniz NEXT_PUBLIC_DISABLE_ADMIN_SYNC=1 ile tamamen devre dışı bırakabilirsiniz.
 */
export default function AdminSessionSync() {
  const pathname = usePathname();
  const ranRef = useRef(false); // mount başına 1 kez çalıştır

  useEffect(() => {
    // Tamamen devre dışı bırakma bayrağı (isteğe bağlı)
    if (process.env.NEXT_PUBLIC_DISABLE_ADMIN_SYNC === '1') return;

    // Yalnızca /admin altında çalış
    if (!pathname?.startsWith('/admin')) return;

    // Aynı mount içinde tekrar tekrar çağırma
    if (ranRef.current) return;
    ranRef.current = true;

    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/admin/whoami', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'x-admin-sync': '1' },
          signal: ac.signal,
        });

        // 401: admin değilsin / login yok → normal durum, akışı bozma, sessizce bitir
        if (res.status === 401) return;

        // Diğer başarısız durumlarda production'da sessiz, dev'de hafif uyarı
        if (!res.ok) {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn('[AdminSessionSync] whoami non-OK:', res.status);
          }
          return;
        }

        const data: WhoAmI = await res.json();

        // TODO: Burada admin state'inizi bir store/context'e yazabilirsiniz.
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[AdminSessionSync] whoami:', data);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[AdminSessionSync] fetch error:', err);
        }
      }
    })();

    return () => ac.abort();
  }, [pathname]);

  return null;
}
