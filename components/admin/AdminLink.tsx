// components/admin/AdminLink.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';

type Props = { className?: string };

export default function AdminLink({ className }: Props) {
  const { publicKey, connected } = useWallet();
  const wallet = useMemo(() => publicKey?.toBase58() ?? '', [publicKey]);
  const [allowed, setAllowed] = useState(false);

  const checkAllowed = useCallback(async () => {
    try {
      const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
      const res = await fetch(`/api/admin/is-allowed${qs}`, {
        cache: 'no-store',
        credentials: 'include', // HttpOnly admin cookie’yi gönderebilmek için şart
      });
      const data = await res.json().catch(() => ({}));
      setAllowed(Boolean(data?.allowed));
    } catch {
      setAllowed(false);
    }
  }, [wallet]);

  useEffect(() => {
    checkAllowed();
  }, [checkAllowed, wallet, connected]);

  useEffect(() => {
    const onFocus = () => checkAllowed();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
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
