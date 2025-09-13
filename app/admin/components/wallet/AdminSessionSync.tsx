'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function AdminSessionSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith('/admin')) return; // yalnız /admin altında

    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/admin/whoami', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: ac.signal,
          headers: { 'x-admin-sync': '1' }
        });

        if (res.status === 401) {
          // admin değil → normal durum; sessizce bitir
          return;
        }
        if (!res.ok) {
          // hata logunu bile yükseltmeyelim; bağlama akışını etkilemesin
          return;
        }

        // const data = await res.json(); // gerekirse kullan
      } catch (_) {
        // yok say
      }
    })();

    return () => ac.abort();
  }, [pathname]);

  return null;
}
