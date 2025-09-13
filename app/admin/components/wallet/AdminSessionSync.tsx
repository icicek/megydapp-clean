'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

type WhoAmI = { ok?: boolean; wallet?: string | null };

export default function AdminSessionSync() {
  const pathname = usePathname();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!pathname?.startsWith('/admin')) return;
    if (process.env.NEXT_PUBLIC_DISABLE_ADMIN_SYNC === '1') return;
    if (ranRef.current) return;
    ranRef.current = true;

    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/admin/whoami?strict=0', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'x-admin-sync': '1' },
          signal: ac.signal,
        });

        if (!res.ok) return; // sessizce çık
        const data: WhoAmI = await res.json();
        // data.ok === true ise admin bilgisini store’a yazabilirsin
      } catch {}
    })();

    return () => ac.abort();
  }, [pathname]);

  return null;
}
