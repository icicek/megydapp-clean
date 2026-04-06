//components/AppWalletBar.tsx
'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
type DirectProvider = 'phantom' | 'solflare' | 'backpack';
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

function walletCardMeta(provider: DirectProvider) {
  switch (provider) {
    case 'phantom':
      return {
        title: 'Phantom',
        icon: '/wallets/phantom.png',
        subtitle: 'Best for most users',
        badge: 'Recommended',
        accent: 'from-[#A98CF5]/28 to-fuchsia-500/10',
        logoBg: 'bg-[#A78CF5]'
      };
    case 'backpack':
      return {
        title: 'Backpack',
        icon: '/wallets/backpack.png',
        subtitle: 'Fast and reliable',
        badge: 'Popular',
        accent: 'from-white/18 to-orange-500/10',
        logoBg: 'bg-white',
      };
    case 'solflare':
      return {
        title: 'Solflare',
        icon: '/wallets/solflare.png',
        subtitle: 'Great Solana wallet',
        badge: 'Secure',
        accent: 'from-[#F3E34F]/20 to-cyan-500/10',
        logoBg: 'bg-[#F7E256]'
      };
    default:
      return {
        title: 'Wallet',
        icon: '',
        subtitle: '',
        badge: '',
        accent: 'from-white/10 to-white/5',
        logoBg: 'bg-white/10',
      };
  }
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
  const w = window as any;

  // UA hints
  if (/Phantom|Backpack|Solflare/i.test(ua)) return true;

  // Injected/provider hints
  if (w?.phantom?.solana) return true;
  if (w?.backpack?.solana || w?.backpack) return true;
  if (w?.solflare || w?.solflare?.isSolflare) return true;

  if (w?.solana?.isPhantom) return true;
  if (w?.solana?.isBackpack) return true;
  if (w?.solana?.isSolflare) return true;

  return false;
}

type RuntimeEnv = {
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isWalletBrowser: boolean;
};

function getRuntimeEnv(): RuntimeEnv {
  return {
    isMobile: isMobileDevice(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isWalletBrowser: isWalletInAppBrowser(),
  };
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
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const walletAddress = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);
  const env = useMemo(() => getRuntimeEnv(), []);

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
  }, [showAdminStatus]);

  useEffect(() => {
    if (!connected) {
      setMobileOpen(false);
      return;
    }
  
    setShowMobileWalletPicker(false);
    setDirectConnectError(null);
    setDirectConnectBusy(null);
  }, [connected]);

  useEffect(() => {
    function handleOutsideClick(event: PointerEvent) {
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

    document.addEventListener('pointerdown', handleOutsideClick);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [mobileOpen, showMobileWalletPicker]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showMobileWalletPicker) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showMobileWalletPicker]);

  const copyAddress = useCallback(async (addr?: string | null) => {
    if (!addr) return;

    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);

      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }

      copiedTimerRef.current = setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 1200);
    } catch (e) {
      console.error('Copy failed', e);
    }
  }, []);

  function handleConnectClick() {
    setDirectConnectError(null);

    if (env.isMobile && !env.isWalletBrowser) {
      setShowMobileWalletPicker(true);
      return;
    }

    setVisible(true);
  }

  async function handleDirectConnect(provider: DirectProvider) {
    try {
      setDirectConnectError(null);
      setDirectConnectBusy(provider);
  
      const appUrl = encodeURIComponent(window.location.origin);
      const ref = encodeURIComponent(window.location.origin);
  
      const urls: Record<DirectProvider, string> = {
        phantom: `https://phantom.app/ul/browse/${appUrl}?ref=${ref}`,
        solflare: `https://solflare.com/ul/v1/browse/${appUrl}?ref=${ref}`,
        backpack: `https://backpack.app/ul/browse/${appUrl}?ref=${ref}`,
      };
  
      window.location.href = urls[provider];
    } catch (e: any) {
      setDirectConnectError(String(e?.message || e || 'Failed to open wallet browser.'));
    } finally {
      setDirectConnectBusy(null);
    }
  }

  const handleDisconnect = useCallback(async () => {
    try {
      setMobileOpen(false);
      await disconnect();
    } catch (e) {
      console.error('Disconnect failed', e);
    }
  }, [disconnect]);

  const walletLabel = wallet?.adapter?.name ?? 'Wallet';

  const mobileHelpText = env.isIOS
    ? 'On iPhone, opening Coincarnation inside your wallet app browser gives the smoothest experience.'
    : env.isAndroid
    ? 'On Android, opening Coincarnation inside your wallet app browser is usually the most reliable option.'
    : 'For the most reliable mobile experience, continue in your wallet app browser.';

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

        <AnimatePresence>
          {showMobileWalletPicker && !connected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[9999] bg-black/78 backdrop-blur-xl flex items-start justify-center px-3 pt-[max(10px,env(safe-area-inset-top))] pb-[max(10px,env(safe-area-inset-bottom))] overflow-hidden"
              onClick={() => {
                setShowMobileWalletPicker(false);
                setDirectConnectError(null);
              }}
            >
              <motion.div
                initial={{ y: 48, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 24, opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-full max-w-md max-h-[calc(100dvh-20px)] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(8,8,10,0.98)_100%)] shadow-[0_24px_90px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 px-4 pt-3 pb-3 border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/12" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="pr-2">
                    <div className="text-[22px] font-semibold tracking-[-0.02em] text-white">
                      Connect Wallet
                    </div>
                    <div className="text-[13px] text-white/50 mt-1 leading-relaxed">
                      Choose how you want to continue.
                    </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowMobileWalletPicker(false);
                        setDirectConnectError(null);
                      }}
                      className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-3 inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
                    Best experience on mobile
                  </div>

                  <div className="mt-3 text-sm text-white/65 leading-relaxed">
                    {mobileHelpText}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 pt-3 space-y-3">
                {(['phantom', 'backpack', 'solflare'] as DirectProvider[]).map((provider) => {
                  const meta = walletCardMeta(provider);
                  const busy = directConnectBusy === provider;

                  return (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => handleDirectConnect(provider)}
                      disabled={!!directConnectBusy}
                      className={[
                        'group relative w-full overflow-hidden rounded-[24px] border px-4 py-3 text-left transition-all duration-200',
                        'bg-white/[0.03] border-white/10 hover:border-white/20',
                        'hover:bg-white/[0.06] active:scale-[0.985]',
                        'disabled:opacity-60 disabled:cursor-not-allowed',
                        'shadow-[0_0_0_1px_rgba(255,255,255,0.02)]',
                      ].join(' ')}
                    >
                      <div className={`absolute inset-0 opacity-100 bg-gradient-to-r ${meta.accent}`} />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_35%)]" />

                      <span className="absolute right-3 top-3 inline-flex max-w-[92px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 px-2 py-[3px] text-[10px] leading-none text-white/75 whitespace-nowrap">
                        {meta.badge}
                      </span>

                      <div className="relative flex items-center gap-3 pr-[92px]">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 overflow-hidden ${meta.logoBg}`}
                        >
                          {meta.icon ? (
                            <img
                              src={meta.icon}
                              alt={`${meta.title} logo`}
                              className="h-9 w-9 object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-base">👛</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-white">
                            {busy ? `Opening ${meta.title}…` : `Open in ${meta.title}`}
                          </div>

                          <div className="mt-1 text-[13px] leading-[1.2] text-white/60 overflow-hidden whitespace-nowrap text-ellipsis">
                            {meta.subtitle}
                          </div>
                        </div>

                        <div className="absolute right-3 bottom-0 text-white/35 transition group-hover:text-white/70 text-[20px] leading-none">                          ↗
                        </div>
                      </div>
                    </button>
                  );
                })}

                  <div className="pt-3 mt-1 border-t border-white/10">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
                      Need another way?
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowMobileWalletPicker(false);
                        setVisible(true);
                      }}
                      className="w-full rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 text-cyan-100 px-4 py-3 text-sm font-semibold hover:from-cyan-500/20 hover:to-blue-500/20 transition shadow-[0_0_30px_rgba(34,211,238,0.08)]"
                    >
                      More options
                    </button>

                    <div className="mt-2 text-xs text-white/45 text-center leading-relaxed">
                      If opening the wallet app does not work, use More options to try Mobile Wallet Adapter or WalletConnect.
                    </div>
                  </div>

                  {directConnectError && (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200 leading-relaxed">
                      {directConnectError}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                onClick={handleDisconnect}
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
                  onClick={handleDisconnect}
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