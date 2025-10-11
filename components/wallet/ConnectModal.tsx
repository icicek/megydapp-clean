// components/wallet/ConnectModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';

import WalletBrandBadge from '@/components/wallet/WalletBrandBadge';
import { Brand } from '@/components/wallet/WalletBrandIcon';
import { connectStable } from '@/lib/solana/connectStable';
import { logEvent } from '@/lib/analytics';

/** ---------------- Types ---------------- */
type Props = { open: boolean; onClose: () => void };

type UIItem = { key: Brand; label: string; note?: string; desc: string };
type Card   = { key: Brand; label: string; note?: string; desc: string; installed: boolean; adapterName?: string };

/** ---------------- Mobile / InApp / Deeplink helpers ---------------- */
const isMobileUA = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Windows Phone/i.test(ua);
};

const isInAppBrowserUA = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /(Instagram|FBAN|FBAV|Messenger|Line|Twitter)/i.test(ua);
};

const isIOS = () => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

const hasInjectedWallet = () => {
  if (typeof window === 'undefined') return false;
  const w: any = window as any;
  return Boolean(
    (w.solana && (w.solana.isPhantom || w.solana.isSolflare || w.solana.isBackpack)) ||
    w.backpack
  );
};

const phantomBrowseLink  = (url: string) => `https://phantom.app/ul/v1/browse?url=${encodeURIComponent(url)}`;
// Solflare: path-parameter + ref REQUIRED
const buildSolflareLinks = (url: string, ref: string) => ({
  scheme: `solflare://ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  https:  `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
});
const backpackBrowseLink = (url: string) => `https://backpack.app/ul/v1/browse?url=${encodeURIComponent(url)}`;

/** ---------------- UI data ---------------- */
const UI: UIItem[] = [
  { key: 'phantom',  label: 'Phantom',        desc: 'Popular & beginner-friendly' },
  { key: 'solflare', label: 'Solflare',       desc: 'Ledger support, in-app staking' },
  { key: 'backpack', label: 'Backpack',       desc: 'xNFTs & power-user features' },
  { key: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile', desc: 'Use mobile wallets via QR' },
];

const INSTALL_URL: Record<Exclude<Brand,'walletconnect'>, string> = {
  phantom:  'https://phantom.app/download',
  solflare: 'https://solflare.com/download',
  backpack: 'https://www.backpack.app/download',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const LAST_KEY = 'cc:lastWalletBrand';

/** ---------------- Small portal helper ---------------- */
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/** ---------------- Heads-up confirm (rendered in Portal) ---------------- */
function RedirectConfirm({
  open, brand, mode = 'browse', href, onCancel, onContinue,
}: {
  open: boolean;
  brand: 'phantom' | 'solflare' | 'backpack';
  mode?: 'browse' | 'direct';
  href?: string; // browse modunda Phantom/Backpack için gerçek <a href>
  onCancel: () => void;
  onContinue: () => void | Promise<void>;
}) {
  if (!open) return null;

  const label =
    mode === 'direct'
      ? 'Connect with Phantom'
      : brand === 'phantom'
        ? 'Open Phantom'
        : brand === 'solflare'
          ? 'Open Solflare'
          : 'Open Backpack';

  const message =
    mode === 'direct'
      ? 'To connect securely, you’ll be taken to Phantom to approve and then return here.'
      : 'For a better experience, you’ll be taken to your wallet’s in-app browser to continue.';

  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        {/* backdrop */}
        <div className="absolute inset-0 bg-black/60" onClick={onCancel} />

        {/* content */}
        <div className="relative w-[92vw] max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 text-white shadow-2xl pointer-events-auto">
          <div className="text-base font-semibold">Heads-up</div>
          <p className="mt-2 text-sm text-gray-200">{message}</p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Cancel
            </button>

            {/* Browse modunda Phantom/Backpack → gerçek <a href>; Solflare → button (scheme→https fallback) */}
            {mode === 'browse' && href && brand !== 'solflare' ? (
              <a
                href={href}
                className="flex-1 text-center rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm hover:bg-emerald-400/20"
                onClick={() => {/* anchor default navigation */}}
              >
                {label}
              </a>
            ) : (
              <button
                type="button"
                onClick={onContinue}
                className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm hover:bg-emerald-400/20"
              >
                {label}
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** ====================================================================== */

export default function ConnectModal({ open, onClose }: Props) {
  const api = useWallet();
  const { wallets, select, disconnect } = api;

  const [err, setErr]           = useState<string | null>(null);
  const [clicked, setClicked]   = useState<Brand | null>(null);
  const [busy, setBusy]         = useState(false);
  const [last, setLast]         = useState<Brand | null>(null);

  const [showSmart, setShowSmart] = useState(false);

  const [deeplinkTrying, setDeeplinkTrying] = useState<null | 'phantom' | 'solflare' | 'backpack'>(null);
  const [deeplinkFailed, setDeeplinkFailed] = useState(false);

  const [confirm, setConfirm] = useState<null | { brand: 'phantom' | 'solflare' | 'backpack'; href?: string; mode?: 'browse' | 'direct' }>(null);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => { if (open) setLast((localStorage.getItem(LAST_KEY) as Brand) || null); }, [open]);
  useEffect(() => { if (open) { setErr(null); setClicked(null); setBusy(false); } }, [open]);

  /** Wallets → installed map */
  const mapByBrand = useMemo(() => {
    const m = new Map<Brand, { adapterName: string; installed: boolean }>();
    for (const w of wallets) {
      const n  = norm(w.adapter.name);
      const rs = (w as any).readyState ?? (w.adapter as any).readyState;
      const installed = rs === 'Installed' || rs === 'Loadable';
      if (n.includes('phantom'))       m.set('phantom',       { adapterName: w.adapter.name, installed });
      if (n.includes('solflare'))      m.set('solflare',      { adapterName: w.adapter.name, installed });
      if (n.includes('backpack'))      m.set('backpack',      { adapterName: w.adapter.name, installed });
      if (n.includes('walletconnect')) m.set('walletconnect', { adapterName: w.adapter.name, installed: true });
    }
    return m;
  }, [wallets]);

  const anyAdapterInstalled = useMemo(() => {
    for (const [, v] of mapByBrand) if (v.installed) return true;
    return false;
  }, [mapByBrand]);

  const cards: Card[] = useMemo(() => {
    const arr = UI.map(({ key, label, note, desc }) => {
      const hit = mapByBrand.get(key);
      return { key, label, note, desc, installed: !!hit?.installed, adapterName: hit?.adapterName };
    });
    if (last) arr.sort((a, b) => (a.key === last ? -1 : b.key === last ? 1 : 0));
    return arr;
  }, [mapByBrand, last]);

  /** SmartConnect panel açılışı + analytics */
  useEffect(() => {
    if (!open) return;
    const shouldSmart = isMobileUA() && !hasInjectedWallet() && !anyAdapterInstalled;
    setShowSmart(shouldSmart);
    if (shouldSmart) {
      logEvent('smart_connect_shown', {
        inApp: isInAppBrowserUA(),
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      });
      if (isInAppBrowserUA()) logEvent('smart_connect_inapp_hint_shown');
    }
  }, [open, anyAdapterInstalled]);

  /** Spinner takılmasın */
  useEffect(() => {
    const reset = () => { setBusy(false); setClicked(null); };
    const onVis = () => { if (document.visibilityState === 'visible') reset(); };
    window.addEventListener('focus', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /** Deeplink launcher */
  function launchDeeplink(href: string, brand: 'phantom' | 'solflare' | 'backpack') {
    setDeeplinkTrying(brand);
    setDeeplinkFailed(false);
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible') setDeeplinkFailed(true);
    }, 2500);
    try {
      window.location.href = href;
    } catch {
      clearTimeout(t);
      setDeeplinkFailed(true);
    }
  }

  /** Solflare: scheme → https fallback */
  function launchSolflare(url: string) {
    setDeeplinkTrying('solflare');
    setDeeplinkFailed(false);

    const ref = typeof window !== 'undefined' ? window.location.origin : '';
    const { scheme, https } = buildSolflareLinks(url, ref);

    const started = Date.now();
    const fallback = setTimeout(() => {
      if (document.visibilityState === 'visible' && Date.now() - started > 120) {
        try { window.location.href = https; } catch {}
      }
    }, 200);

    try {
      // First try app scheme
      window.location.href = scheme;
    } catch {
      clearTimeout(fallback);
      window.location.href = https;
    }

    setTimeout(() => {
      if (document.visibilityState === 'visible') setDeeplinkFailed(true);
    }, 2500);
  }

  /** Kart seçimi */
  async function handlePick(brand: Brand) {
    if (busy) return;
    setErr(null);
    setClicked(brand);

    const hit = mapByBrand.get(brand);
    const mobile = isMobileUA();
    const injected = hasInjectedWallet();

    logEvent('wallet_connect_attempt', { brand });

    if (brand === 'walletconnect' && !hit?.adapterName) {
      setErr('WalletConnect is not configured.');
      setClicked(null);
      return;
    }

    // Mobil + no injection → confirm
    if (mobile && !injected && (brand === 'phantom' || brand === 'solflare' || brand === 'backpack')) {
      setConfirm({
        brand: brand as 'phantom' | 'solflare' | 'backpack',
        href:
          brand === 'phantom'  ? phantomBrowseLink(currentUrl)  :
          brand === 'backpack' ? backpackBrowseLink(currentUrl) :
          undefined, // Solflare: href yok; button onClick → launchSolflare
        mode: 'browse',
      });
      return;
    }

    // Masaüstü: kurulu değilse store linki
    if ((brand === 'phantom' || brand === 'solflare' || brand === 'backpack') && (!hit?.adapterName || !hit.installed)) {
      if (!mobile) {
        window.open(INSTALL_URL[brand], '_blank', 'noopener,noreferrer');
        setClicked(null);
        return;
      }
      setShowSmart(true);
      setClicked(null);
      return;
    }

    // Normal connect akışı
    try {
      setBusy(true);
      await select(hit!.adapterName as WalletName);
      await connectStable(hit!.adapterName!, api);
      localStorage.setItem(LAST_KEY, brand);
      logEvent('wallet_connect_success', { brand });
      onClose();
    } catch (e: any) {
      setErr(e?.message || String(e) || 'Failed to connect.');
      logEvent('wallet_connect_error', { brand, message: e?.message || String(e) });
      try { await disconnect(); } catch {}
      setBusy(false);
      setClicked(null);
    }
  }

  /** -------- Smart panel (modal içi) -------- */
  const SmartPanel = () => {
    if (!showSmart) return null;

    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(currentUrl);
        alert('Link copied. You can paste it into your wallet’s in-app browser.');
      } catch {
        prompt('Copy this link:', currentUrl);
      }
    };

    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-300/10 p-3 mb-4">
        <div className="text-sm font-semibold text-amber-200">Smart Connect (Mobile)</div>

        <p className="text-xs text-amber-100/90 mt-1">
          Your browser doesn’t inject a wallet. Open this DApp inside your wallet’s in-app browser or use WalletConnect.
        </p>

        {isInAppBrowserUA() && (
          <div className="mt-2 text-[11px] text-amber-100/90">
            You seem to be in an in-app browser (e.g., Instagram/Facebook). Tap the menu and choose
            <span className="px-1 mx-1 rounded bg-white/10 border border-white/10">Open in Safari</span>
            or use one of the buttons below.
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            className="w-full rounded-lg py-2 text-sm border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => { logEvent('smart_connect_open_in_phantom', { inApp: isInAppBrowserUA() }); setConfirm({ brand: 'phantom', href: phantomBrowseLink(currentUrl), mode: 'browse' }); }}
          >
            Open in Phantom
          </button>
          <button
            className="w-full rounded-lg py-2 text-sm border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => {
              logEvent('smart_connect_open_in_solflare', { inApp: isInAppBrowserUA() });
              setConfirm({ brand: 'solflare', mode: 'browse' }); // href yok
            }}
          >
            Open in Solflare
          </button>
          <button
            className="w-full rounded-lg py-2 text-sm border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => { logEvent('smart_connect_open_in_backpack', { inApp: isInAppBrowserUA() }); setConfirm({ brand: 'backpack', href: backpackBrowseLink(currentUrl), mode: 'browse' }); }}
          >
            Open in Backpack
          </button>
          <button
            className="w-full rounded-lg py-2 text-sm border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => { logEvent('smart_connect_walletconnect_hint'); alert('Use “WalletConnect” below to connect with other mobile wallets.'); }}
          >
            Other wallets (WalletConnect)
          </button>

          {/* Direct Connect (Phantom) */}
          <button
            className="w-full rounded-lg py-2 text-sm border border-purple-400/40 bg-purple-400/10 hover:bg-purple-400/20"
            onClick={() => {
              logEvent('direct_connect_start', { provider: 'phantom' });
              setConfirm({ brand: 'phantom', mode: 'direct' });
            }}
          >
            Direct Connect (Phantom)
          </button>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded-md border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={copyLink}
          >
            Copy link
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded-md border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => setShowSmart(false)}
          >
            Hide
          </button>
        </div>

        {deeplinkTrying && deeplinkFailed && (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 p-3">
            <div className="text-sm font-semibold text-red-200">Didn’t open?</div>
            <ul className="list-disc pl-5 text-xs text-red-100/90 mt-1 space-y-1">
              <li>Try again and keep the screen unlocked.</li>
              {isIOS() && <li>Tap the menu and choose <b>“Open in Safari”</b>.</li>}
              <li>Use <b>WalletConnect</b> below for other wallets.</li>
              <li>Or <b>Copy link</b> and open it from your wallet’s in-app browser.</li>
            </ul>
            <div className="flex gap-2 mt-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md border border-white/15 bg-white/5 hover:bg-white/10"
                onClick={() => setDeeplinkFailed(false)}
              >
                Try again
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-md border border-white/15 bg-white/5 hover:bg-white/10"
                onClick={() => handlePick('walletconnect')}
              >
                Start WalletConnect
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /** -------- ConfirmLayer (return'den önce, tek tanım) -------- */
  const ConfirmLayer = () => {
    if (!confirm) return null;
    const { brand, mode = 'browse' } = confirm;

    // Browse için deeplink URL (Phantom/Backpack anchor’a verilecek)
    const href =
      brand === 'phantom'  ? phantomBrowseLink(currentUrl)  :
      brand === 'backpack' ? backpackBrowseLink(currentUrl) :
      undefined; // Solflare: href yok; button onClick → launchSolflare

    const continueHandler = async () => {
      if (mode === 'direct') {
        try {
          const { openDirectConnect } = await import('@/lib/wallet/direct/direct');
          await openDirectConnect('phantom', {
            appUrl: window.location.origin,
            redirectLink: `${window.location.origin}/wallet/callback/phantom`,
          });
        } catch {
          alert('Direct Connect failed to start.');
        } finally {
          setConfirm(null);
        }
        return;
      }

      // BROWSE:
      if (brand === 'solflare') {
        // scheme→https fallback içerir
        launchSolflare(currentUrl);
        setConfirm(null);
      }
      // Phantom/Backpack'te anchor default navigation çalışacağı için burada ekstra bir şey yok
    };

    return (
      <RedirectConfirm
        open
        brand={brand}
        mode={mode}
        href={href}
        onCancel={() => setConfirm(null)}
        onContinue={continueHandler}
      />
    );
  };

  /** -------------------- RENDER -------------------- */
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogOverlay
        className="z-[90] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out
                   data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200"
      />
      <DialogContent
        className="bg-zinc-900 text-white p-6 rounded-2xl w-[92vw] max-w-md max-h-[85vh]
                   overflow-y-auto overscroll-contain z-[100] shadow-2xl border border-white/10
                   data-[state=open]:animate-in data-[state=closed]:animate-out
                   data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
                   data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-1
                   sm:data-[state=open]:slide-in-from-bottom-2 duration-250"
      >
        {/* Header */}
        <div className="sticky top-0 -m-6 px-6 pt-3 pb-2 z-[100] flex items-center justify-between pointer-events-none">
          <DialogTitle className="text-white/95 text-base font-semibold pointer-events-auto">
            Connect a Solana wallet
          </DialogTitle>
          <button
            onClick={onClose}
            aria-label="Close"
            className="pointer-events-auto inline-flex items-center justify-center h-8 w-8
                       rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="h-6 sm:h-8" />
        <DialogDescription className="sr-only">Choose a wallet to connect.</DialogDescription>

        <SmartPanel />

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 sm:mt-8 touch-pan-y">
          {cards.map(({ key, label, note, desc, installed }) => {
            const isBusy = busy && clicked === key;
            const isLast = last === key;
            const badge =
              key === 'walletconnect' ? { text: 'QR',        cls: 'bg-indigo-600/30 border-indigo-500/50' } :
              installed              ? { text: 'Installed', cls: 'bg-emerald-600/30 border-emerald-500/50' } :
                                       { text: 'Install',   cls: 'bg-zinc-700/50   border-zinc-500/50' };

            return (
              <motion.button
                key={key}
                layout
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handlePick(key)}
                disabled={busy}
                className="relative grid grid-rows-[auto_1fr_auto] h-[8.5rem]
                           rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.07]
                           pl-4 pr-14 pt-5 pb-3 overflow-hidden outline-none focus:outline-none select-none"
              >
                {isLast && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-emerald-400/40" />}
                <span className={`absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>
                  {badge.text}
                </span>
                <div className="relative z-10 flex items-center gap-2">
                  <WalletBrandBadge brand={key} size={24} className="h-6 w-6 shrink-0" />
                  <span className="font-semibold">{label}</span>
                </div>
                <div
                  className="relative z-10 text-xs text-gray-300 mt-2 self-start"
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {desc}{note ? ` — ${note}` : ''}
                </div>
                {!installed && key !== 'walletconnect' && !isMobileUA() && (
                  <a
                    href={INSTALL_URL[key as keyof typeof INSTALL_URL]}
                    target="_blank"
                    rel="noreferrer"
                    className="relative z-10 self-end text-[11px] text-gray-300 underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Not installed? Get {label}
                  </a>
                )}
                {isBusy && (
                  <div className="absolute right-2 bottom-2 z-10 text-[11px] text-gray-400 flex items-center gap-2">
                    <span className="inline-block h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Connecting…
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Need a wallet? */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-sm font-semibold mb-2">Need a wallet?</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] text-gray-300">
            <div className="rounded-lg p-3 bg-black/20 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <WalletBrandBadge brand="phantom" size={18} />
                <div className="font-medium">Phantom</div>
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Best for starters</li>
                <li>Great UX, mobile + desktop</li>
                <li>Auto-detect tokens/NFTs</li>
              </ul>
              <a href={INSTALL_URL.phantom} target="_blank" className="underline mt-2 inline-block">Install Phantom</a>
            </div>

            <div className="rounded-lg p-3 bg-black/20 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <WalletBrandBadge brand="solflare" size={18} />
                <div className="font-medium">Solflare</div>
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Ledger compatible</li>
                <li>Built-in staking</li>
                <li>Mobile + desktop</li>
              </ul>
              <a href={INSTALL_URL.solflare} target="_blank" className="underline mt-2 inline-block">Install Solflare</a>
            </div>
          </div>
        </div>

        {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
      </DialogContent>

      {/* Heads-up confirm via Portal */}
      <ConfirmLayer />
    </Dialog>
  );
}
