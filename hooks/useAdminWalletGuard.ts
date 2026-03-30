//hooks/useAdminWalletGuard.ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

type AdminWhoAmIResponse =
  | { ok: true; isAdmin: boolean; wallet?: string | null }
  | { ok: false; error?: string };

function normalize(value?: string | null) {
  return String(value || '').trim();
}

export default function useAdminWalletGuard() {
  const { publicKey } = useWallet();
  const connectedWallet = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);

  const [loading, setLoading] = useState(true);
  const [adminSessionActive, setAdminSessionActive] = useState(false);
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        setLoading(true);

        const res = await fetch('/api/admin/whoami', {
          credentials: 'include',
          cache: 'no-store',
        });

        const data: AdminWhoAmIResponse = await res.json().catch(() => ({ ok: false }));

        if (ignore) return;

        if (res.ok && data.ok) {
          setAdminSessionActive(true);
          setSessionWallet(data.wallet ?? null);
        } else {
          setAdminSessionActive(false);
          setSessionWallet(null);
        }
      } catch {
        if (!ignore) {
          setAdminSessionActive(false);
          setSessionWallet(null);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, []);

  const walletMatches =
    !!connectedWallet &&
    !!sessionWallet &&
    normalize(connectedWallet) === normalize(sessionWallet);

  const canRunCriticalAdminAction =
    adminSessionActive && !!connectedWallet && walletMatches;

  let guardMessage: string | null = null;

  if (!loading) {
    if (!adminSessionActive) {
      guardMessage = 'No active admin session.';
    } else if (!connectedWallet) {
      guardMessage = 'Please connect your admin wallet.';
    } else if (!walletMatches) {
      guardMessage = 'Please switch back to your admin wallet for this action.';
    }
  }

  return {
    loading,
    adminSessionActive,
    connectedWallet,
    sessionWallet,
    walletMatches,
    canRunCriticalAdminAction,
    guardMessage,
  };
}