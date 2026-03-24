// components/admin/AdminLink.tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Props = { className?: string };

export default function AdminLink({ className }: Props) {
  const [allowed, setAllowed] = useState(false);

  const checkAllowed = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whoami?strict=0', {
        cache: 'no-store',
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));
      setAllowed(Boolean(data?.ok));
    } catch {
      setAllowed(false);
    }
  }, []);

  useEffect(() => {
    checkAllowed();
  }, [checkAllowed]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkAllowed();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [checkAllowed]);

  if (!allowed) return null;

  return (
    <div className={className ?? ''}>
      <div className="w-full flex justify-center">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10
                     bg-white/5 hover:bg-white/10 transition-colors text-sm"
        >
          <span>🛠️</span>
          <span>Go to Admin Panel</span>
        </Link>
      </div>
    </div>
  );
}
