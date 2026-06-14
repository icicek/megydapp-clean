// components/admin/AdminLink.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';

type Props = { className?: string };

export default function AdminLink({ className }: Props) {
  const { publicKey, connected } = useWallet();
  const wallet = useMemo(() => publicKey?.toBase58() ?? '', [publicKey]);

  const [isAllowedWallet, setIsAllowedWallet] = useState(false);
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);

  const checkState = useCallback(async () => {
    try {
      // 1) Wallet allowlist check
      if (!wallet) {
        setIsAllowedWallet(false);
      } else {
        const allowRes = await fetch(
          `/api/admin/is-allowed?wallet=${encodeURIComponent(wallet)}`,
          {
            cache: 'no-store',
            credentials: 'include',
          }
        );

        const allowData = await allowRes.json().catch(() => ({}));
        setIsAllowedWallet(Boolean(allowData?.allowed));
      }

      // 2) Active admin session check
      const whoamiRes = await fetch('/api/admin/whoami?strict=0', {
        cache: 'no-store',
        credentials: 'include',
      });

      const whoamiData = await whoamiRes.json().catch(() => ({}));
      const sw =
        typeof whoamiData?.wallet === 'string'
          ? whoamiData.wallet
          : typeof whoamiData?.sub === 'string'
            ? whoamiData.sub
            : null;

      setSessionWallet(sw);
    } catch {
      setIsAllowedWallet(false);
      setSessionWallet(null);
    }
  }, [wallet]);

  useEffect(() => {
    checkState();
  }, [checkState, wallet, connected]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkState();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [checkState]);

  const sessionMatchesConnectedWallet =
    Boolean(wallet) &&
    Boolean(sessionWallet) &&
    wallet.toLowerCase() === String(sessionWallet).toLowerCase();

  const showAdminLink =
    connected && (isAllowedWallet || sessionMatchesConnectedWallet);

  if (!showAdminLink) return null;

  return (
    <div className={className ?? ''}>
      <div className="w-full flex justify-center">
        <Link
          href={sessionMatchesConnectedWallet ? '/admin' : '/admin/login'}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10
                     bg-white/5 hover:bg-white/10 transition-colors text-sm"
        >
          <span>🛠️</span>
          <span>
            {sessionMatchesConnectedWallet ? 'Go to Admin Panel' : 'Admin Login'}
          </span>
        </Link>
      </div>
    </div>
  );
}