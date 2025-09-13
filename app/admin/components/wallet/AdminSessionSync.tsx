// components/wallet/AdminSessionSync.tsx
'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function AdminSessionSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith('/admin')) return; // sadece /admin

    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/admin/whoami', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: ac.signal,
        });

        if (res.status === 401) {
          // admin değil → normal durum, sessizce çık
          return;
        }
        if (!res.ok) {
          console.warn('[whoami] non-OK:', res.status);
          return;
        }

        const data = await res.json();
        // TODO: burada admin state’ini store’a yazıyor olabilirsin
        // setAdmin(data)
      } catch (e) {
        if (!(e as any)?.name?.includes('Abort')) {
          console.warn('[whoami] error:', e);
        }
      }
    })();

    return () => ac.abort();
  }, [pathname]);

  return null;
}
