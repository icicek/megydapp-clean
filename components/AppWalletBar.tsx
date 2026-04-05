//components/AppWalletBar.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { openDirectConnect, type Provider as DirectProvider } from '@/lib/wallet/direct/direct';

type AppWalletBarProps = {
  showAdminStatus?: boolean;
  className?: string;
};

type AdminWhoAmIResponse =
  | { ok: true; wallet?: string | null }
  | { ok: false; error?: string; wallet?: null };

function shortenAddress(address?: string | null) {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function isIOS() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua);
}

function isAndroid() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua);
}

function isWalletInAppBrowser() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Phantom|Backpack|Solflare/i.test(ua);
}

function getDirectConnectRedirectLink() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/`;
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [showMobileWalletPicker, setShowMobileWalletPicker] = useState(false);
  const [directConnectBusy, setDirectConnectBusy] = useState<DirectProvider | null>(null);
  const [directConnectError, setDirectConnectError] = useState<string | null>(null);

  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const walletAddress = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);

  const walletMatchesAdmin =
    !!walletAddress &&
    !!adminWallet &&
    walletAddress.trim() === adminWallet.trim();

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
          setAdminActive(true);
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
  }, [showAdminStatus, walletAddress, connected]);

  useEffect(() => {
    if (!connected) {
      setMobileOpen(false);
    }
  }, [connected]);

  useEffect(() => {
    if (connected) {
      setShowMobileWalletPicker(false);
      setDirectConnectError(null);
      setDirectConnectBusy(null);
    }
  }, [connected]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!mobileMenuRef.current) return;

      const target = event.target as Node | null;
      if (target && !mobileMenuRef.current.contains(target)) {
        if (mobileOpen) setMobileOpen(false);
        if (showMobileWalletPicker) {
          setShowMobileWalletPicker(false);
          setDirectConnectError(null);
        }
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [mobileOpen, showMobileWalletPicker]);

  async function copyAddress(addr?: string | null) {
    if (!addr) return;
  
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error('Copy failed', e);
    }
  }

  function handleConnectClick() {
    setDirectConnectError(null);

    // Mobile external browser -> show our custom wallet picker
    if (isMobileDevice() && !isWalletInAppBrowser()) {
      setShowMobileWalletPicker(true);
      return;
    }

    // Desktop or wallet in-app browser -> keep standard modal
    setVisible(true);
  }

  async function handleDirectConnect(provider: DirectProvider) {
    try {
      setDirectConnectError(null);
      setDirectConnectBusy(provider);

      await openDirectConnect(provider, {
        appUrl: window.location.origin,
        redirectLink: getDirectConnectRedirectLink(),
        cluster: 'mainnet-beta',
      });
    } catch (e: any) {
      setDirectConnectError(String(e?.message || e || 'Failed to open wallet.'));
    } finally {
      setDirectConnectBusy(null);
    }
  }

  const walletLabel = wallet?.adapter?.name ?? 'Wallet';

  return (
    <div className={`w-full ${className}`}>
      {/* Mobile premium compact */}
      <div className="md:hidden relative" ref={mobileMenuRef}>
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-3 py-2.5">
          <div className="min-w-0 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                connected ? 'bg-emerald-400' : 'bg-white/30'
              }`}
            />
            <div className="min-w-0">
              {connected && walletAddress ? (
                <div className="truncate text-sm font-medium text-white">
                  <div className="flex items-center gap-2">
                    <span className="truncate">
                        {walletLabel} · {shortenAddress(walletAddress)}
                    </span>

                    <button
                      onClick={() => copyAddress(walletAddress)}
                      className="rounded-md px-1.5 py-1 text-white/50 hover:bg-white/5 hover:text-white text-xs transition"
                      aria-label="Copy wallet address"
                      title={copied ? 'Copied' : 'Copy wallet address'}
                    >
                      {copied ? '✓' : '⧉'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="truncate text-sm text-white/70">
                  No wallet connected
                </div>
              )}
            </div>
          </div>

          {!connected ? (
            <button
              type="button"
              onClick={handleConnectClick}
              className="ml-3 shrink-0 rounded-xl border border-white/10 bg-white text-black px-3 py-2 text-xs font-semibold hover:opacity-90 transition"
            >
              Connect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="ml-3 shrink-0 rounded-xl border border-white/10 bg-white/5 text-white px-3 py-2 text-xs font-semibold hover:bg-white/10 transition"
            >
              Wallet
            </button>
          )}
        </div>

        {showMobileWalletPicker && !connected && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-black/70 backdrop-blur-md p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  Open in your wallet
                </div>
                <div className="text-xs text-white/60 mt-1">
                  For the most reliable mobile experience, continue inside your wallet app browser.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowMobileWalletPicker(false);
                  setDirectConnectError(null);
                }}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleDirectConnect('phantom')}
                disabled={!!directConnectBusy}
                className="rounded-xl border border-white/10 bg-white/5 text-white px-4 py-3 text-sm font-medium hover:bg-white/10 transition disabled:opacity-60 disabled:cursor-not-allowed text-left"
              >
                {directConnectBusy === 'phantom' ? 'Opening Phantom…' : 'Open in Phantom'}
              </button>

              <button
                type="button"
                onClick={() => handleDirectConnect('backpack')}
                disabled={!!directConnectBusy}
                className="rounded-xl border border-white/10 bg-white/5 text-white px-4 py-3 text-sm font-medium hover:bg-white/10 transition disabled:opacity-60 disabled:cursor-not-allowed text-left"
              >
                {directConnectBusy === 'backpack' ? 'Opening Backpack…' : 'Open in Backpack'}
              </button>

              <button
                type="button"
                onClick={() => handleDirectConnect('solflare')}
                disabled={!!directConnectBusy}
                className="rounded-xl border border-white/10 bg-white/5 text-white px-4 py-3 text-sm font-medium hover:bg-white/10 transition disabled:opacity-60 disabled:cursor-not-allowed text-left"
              >
                {directConnectBusy === 'solflare' ? 'Opening Solflare…' : 'Open in Solflare'}
              </button>
            </div>

            <div className="pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setShowMobileWalletPicker(false);
                  setVisible(true);
                }}
                className="w-full rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-200 px-4 py-3 text-sm font-medium hover:bg-cyan-500/15 transition"
              >
                More options
              </button>
              <div className="mt-2 text-[11px] text-white/45 text-center">
                Use this only if opening the wallet app does not work on your device.
              </div>
            </div>

            {directConnectError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
                {directConnectError}
              </div>
            )}
          </div>
        )}

        {connected && mobileOpen && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md p-3 space-y-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/40">
              Wallet Actions
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-xs text-white/50">Connected wallet</div>

              <div className="mt-1 flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm font-medium text-white break-all">
                  {walletLabel} · {walletAddress}
                </div>

                <button
                  type="button"
                  onClick={() => copyAddress(walletAddress)}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
                  aria-label="Copy wallet address"
                  title={copied ? 'Copied' : 'Copy wallet address'}
                >
                  {copied ? '✓' : '⧉'}
                </button>
              </div>
            </div>

            {showAdminStatus && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-xs text-white/50 mb-1">Admin session</div>

                {loadingAdmin ? (
                  <div className="text-sm text-white/60">Checking...</div>
                ) : adminActive ? (
                  <div className="space-y-2">
                    <div
                      className={[
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs',
                        walletMatchesAdmin
                          ? 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-300'
                          : 'border border-amber-400/20 bg-amber-400/10 text-amber-300',
                      ].join(' ')}
                    >
                      {walletMatchesAdmin
                        ? 'Admin Session Active'
                        : 'Admin Session Active · Different Wallet'}
                    </div>

                    {adminWallet ? (
                      <div className="text-xs text-white/40 break-all">
                        Admin session: {adminWallet}
                      </div>
                    ) : null}

                    {walletAddress && adminWallet && !walletMatchesAdmin ? (
                      <div className="text-xs text-amber-300/80">
                        Connected wallet differs from session wallet
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-white/60">No active admin session</div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setVisible(true);
                }}
                className="rounded-xl border border-white/10 bg-white/5 text-white px-4 py-3 text-sm font-medium hover:bg-white/10 transition"
              >
                Switch Wallet
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  disconnect();
                }}
                className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 px-4 py-3 text-sm font-medium hover:bg-red-500/20 transition"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden md:block rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">
              Wallet Connection
            </div>

            {connected && walletAddress ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-white">
                <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2.5 py-1 text-emerald-300">
                  Connected
                </span>

                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {walletLabel} · {shortenAddress(walletAddress)}
                  </span>

                  <button
                    onClick={() => copyAddress(walletAddress)}
                    className="rounded-md px-2 py-1 text-xs text-white/50 hover:bg-white/5 hover:text-white transition"
                    aria-label="Copy wallet address"
                    title={copied ? 'Copied' : 'Copy wallet address'}
                  >
                    {copied ? '✓' : '⧉'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-white/70">No wallet connected</div>
            )}

            {showAdminStatus && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                {loadingAdmin ? (
                  <span className="text-white/50">Checking admin session...</span>
                ) : adminActive ? (
                  <>
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2.5 py-1',
                        walletMatchesAdmin
                          ? 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-300'
                          : 'border border-amber-400/20 bg-amber-400/10 text-amber-300',
                      ].join(' ')}
                    >
                      {walletMatchesAdmin
                        ? 'Admin Session Active'
                        : 'Admin Session Active · Different Wallet'}
                    </span>

                    {adminWallet ? (
                      <span className="text-white/40">
                        Admin session: {shortenAddress(adminWallet)}
                      </span>
                    ) : null}

                    {walletAddress && adminWallet && !walletMatchesAdmin ? (
                      <span className="text-amber-300/80">
                        Connected wallet differs from session wallet
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
                onClick={handleConnectClick}
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
                  className="rounded-xl border border-red-500/15 bg-red-500/10 text-red-300 px-4 py-2 text-sm font-medium hover:bg-red-500/15 transition"                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}