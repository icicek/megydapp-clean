//components/AppWalletBar.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

type AppWalletBarProps = {
  showAdminStatus?: boolean;
  className?: string;
};

type AdminWhoAmIResponse =
  | { ok: true; isAdmin: boolean; wallet?: string | null }
  | { ok: false; error?: string };

function shortenAddress(address?: string | null) {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function AppWalletBar({
  showAdminStatus = false,
  className = '',
}: AppWalletBarProps) {
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [adminActive, setAdminActive] = useState(false);
  const [adminWallet, setAdminWallet] = useState<string | null>(null);

  const walletAddress = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);

  useEffect(() => {
    let ignore = false;

    async function loadAdminStatus() {
      if (!showAdminStatus) return;

      try {
        setLoadingAdmin(true);

        const res = await fetch('/api/admin/whoami', {
          credentials: 'include',
          cache: 'no-store',
        });

        const data: AdminWhoAmIResponse = await res.json();

        if (ignore) return;

        if (res.ok && data.ok) {
          setAdminActive(Boolean(data.isAdmin));
          setAdminWallet(data.wallet ?? null);
        } else {
          setAdminActive(false);
          setAdminWallet(null);
        }
      } catch {
        if (!ignore) {
          setAdminActive(false);
          setAdminWallet(null);
        }
      } finally {
        if (!ignore) setLoadingAdmin(false);
      }
    }

    loadAdminStatus();

    return () => {
      ignore = true;
    };
  }, [showAdminStatus]);

  return (
    <div
      className={`w-full rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md px-4 py-3 ${className}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Wallet Connection
          </div>

          {connected && walletAddress ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-white">
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300 border border-emerald-500/20">
                Connected
              </span>

              <span className="font-medium">
                {wallet?.adapter?.name ?? 'Wallet'} · {shortenAddress(walletAddress)}
              </span>
            </div>
          ) : (
            <div className="text-sm text-white/70">
              No wallet connected
            </div>
          )}

          {showAdminStatus && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              {loadingAdmin ? (
                <span className="text-white/50">Checking admin session...</span>
              ) : adminActive ? (
                <>
                  <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-300">
                    Admin Session Active
                  </span>
                  {adminWallet ? (
                    <span className="text-white/50">
                      Session wallet: {shortenAddress(adminWallet)}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-white/50">No active admin session</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={() => setVisible(true)}
              className="rounded-xl border border-white/10 bg-white text-black px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              Connect Wallet
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setVisible(true)}
                className="rounded-xl border border-white/10 bg-white/5 text-white px-4 py-2 text-sm font-medium hover:bg-white/10 transition"
              >
                Switch Wallet
              </button>

              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 px-4 py-2 text-sm font-medium hover:bg-red-500/20 transition"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}