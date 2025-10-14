// components/wallet/ConnectModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogOverlay, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';

import WalletBrandBadge from '@/components/wallet/WalletBrandBadge';
import { Brand } from '@/components/wallet/WalletBrandIcon';
import { connectStable } from '@/lib/solana/connectStable';
import { logEvent } from '@/lib/analytics';

/* ───────────────────────── Types ───────────────────────── */
type Props = { open: boolean; onClose: () => void };

type UIItem = { key: Brand; label: string; note?: string; desc: string };
type Card   = { key: Brand; label: string; note?: string; desc: string; installed: boolean; adapterName?: string };

/* ─────────────────────── UA / helpers ─────────────────────── */
const isMobileUA = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Windows Phone/i.test(ua);
};
const isAndroid = () => typeof window !== 'undefined' && /Android/i.test(navigator.userAgent);
const isIOS     = () => typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isInAppBrowserUA = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /(Instagram|FBAN|FBAV|Messenger|Line|Twitter)/i.test(ua);
};
const isWalletInAppUA = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /(Solflare|Phantom|Backpack|xNFT)/i.test(ua)
    || (window as any)?.solana?.isPhantom
    || (window as any)?.solflare
    || (window as any)?.backpack;
};
const hasInjectedWallet = () => {
  if (typeof window === 'undefined') return false;
  const w: any = window as any;
  return Boolean(
    (w.solana && (w.solana.isPhantom || w.solana.isSolflare || w.solana.isBackpack || typeof w.solana?.connect === 'function')) ||
    w.backpack ||
    (w.solflare && typeof w.solflare?.connect === 'function')
  );
};

const phantomBrowseLink  = (url: string) => `https://phantom.app/ul/v1/browse?url=${encodeURIComponent(url)}`;
const backpackBrowseLink = (url: string) => `https://backpack.app/ul/v1/browse?url=${encodeURIComponent(url)}`;
const buildSolflareLinks = (url: string, ref: string) => ({
  scheme: `solflare://ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  https:  `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
});
function withAutoConnect(u: string, brand: 'phantom'|'solflare'|'backpack') {
  try {
    const url = new URL(u);
    url.searchParams.set('ac', '1');
    url.searchParams.set('brand', brand);
    return url.toString();
  } catch { return u; }
}
function markFlight(brand: 'phantom' | 'solflare' | 'backpack') {
  try {
    const now = Date.now();
    localStorage.setItem('sc:flight', JSON.stringify({ brand, ts: now }));
    localStorage.setItem('sc:brand', brand);
    localStorage.setItem('sc:ac', '1');
  } catch {}
}

/* ───────────────────────── UI data ───────────────────────── */
const UI: UIItem[] = [
  { key: 'phantom',  label: 'Phantom',  desc: 'Popular & beginner-friendly' },
  { key: 'solflare', label: 'Solflare', desc: 'Ledger support, in-app staking' },
  { key: 'backpack', label: 'Backpack', desc: 'xNFTs & power-user features' },
  { key: 'walletconnect', label: 'WalletConnect', note: 'QR / Mobile', desc: 'Use mobile wallets via QR' },
];

const INSTALL_URL: Record<Exclude<Brand,'walletconnect'>, string> = {
  phantom:  'https://phantom.app/download',
  solflare: 'https://solflare.com/download',
  backpack: 'https://www.backpack.app/download',
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const LAST_KEY = 'cc:lastWalletBrand';

/* ─────────────────────── Portal helper ─────────────────────── */
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/* ───────────── Heads-up confirm (Portal) ───────────── */
function RedirectConfirm({
  open, brand, mode = 'browse', href, onCancel, onContinue, onResolved,
}: {
  open: boolean;
  brand: 'phantom' | 'solflare' | 'backpack';
  mode?: 'browse' | 'direct';
  href?: string;
  onCancel: () => void;
  onContinue: () => void | Promise<void>;
  onResolved: () => void;
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

  const onClickAnchor = () => {
    // Navigasyon ÖNCESİ: state reset—BFCache dönüşünde takılı kalmasın
    onResolved();
    markFlight(brand);
    try { logEvent('smart_connect_flight_marked', { brand }); } catch {}
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={() => { onResolved(); onCancel(); }} />
        <div className="relative w-[92vw] max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 text-white shadow-2xl pointer-events-auto">
          <div className="text-base font-semibold">Heads-up</div>
          <p className="mt-2 text-sm text-gray-200">{message}</p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => { onResolved(); onCancel(); }}
              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Cancel
            </button>

            {mode === 'browse' && href ? (
              <a
                href={href}
                onClick={onClickAnchor}
                className="flex-1 text-center rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm hover:bg-emerald-400/20"
              >
                {label}
              </a>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  // Continue’da da önce reset et
                  onResolved();
                  markFlight(brand);
                  try { logEvent('smart_connect_flight_marked', { brand }); } catch {}
                  await onContinue();
                }}
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

/* ===================================================================== */

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

  const [confirm, setConfirm] = useState<
    null | { brand: 'phantom' | 'solflare' | 'backpack'; href?: string; mode?: 'browse' | 'direct' }
  >(null);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  // Modal her açıldığında confirm dahil tüm transient state'i sıfırla
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setClicked(null);
    setBusy(false);
    setDeeplinkTrying(null);
    setDeeplinkFailed(false);
    setConfirm(null);                 // ✅ kritik
    setLast((localStorage.getItem(LAST_KEY) as Brand) || null);
  }, [open]);

  // Dış tarayıcıya dönüşte (pageshow / visibilitychange / focus / smartconnect:reset) state reset
  useEffect(() => {
    const resetTransient = () => {
      // Sadece dış tarayıcıda reset—cüzdan in-app değilsek
      if (typeof window === 'undefined') return;
      const ua = navigator.userAgent || '';
      const inApp =
        /Phantom|Solflare|Backpack|xNFT/i.test(ua) ||
        (window as any)?.solana?.isPhantom ||
        (window as any)?.solflare ||
        (window as any)?.backpack;

      if (document.visibilityState === 'visible' && !inApp) {
        setConfirm(null);
        setClicked(null);
        setBusy(false);
        setDeeplinkTrying(null);
        setDeeplinkFailed(false);
        setErr(null);
      }
    };
    window.addEventListener('pageshow', resetTransient);
    document.addEventListener('visibilitychange', resetTransient);
    window.addEventListener('focus', resetTransient);
    window.addEventListener('smartconnect:reset', resetTransient as EventListener);
    return () => {
      window.removeEventListener('pageshow', resetTransient);
      document.removeEventListener('visibilitychange', resetTransient);
      window.removeEventListener('focus', resetTransient);
      window.removeEventListener('smartconnect:reset', resetTransient as EventListener);
    };
  }, []);

  /* Wallets → installed map */
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

  /* SmartConnect flags */
  useEffect(() => {
    if (!open) return;
    const shouldSmart = isMobileUA() && !hasInjectedWallet() && !anyAdapterInstalled && !isWalletInAppUA();
    setShowSmart(shouldSmart);
    if (shouldSmart) {
      logEvent('smart_connect_shown', {
        inApp: isInAppBrowserUA(),
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      });
      if (isInAppBrowserUA()) logEvent('smart_connect_inapp_hint_shown');
    }
  }, [open, anyAdapterInstalled]);

  /* Launchers */
  function launchSolflare(url: string) {
    if (isWalletInAppUA()) return;
    setDeeplinkTrying('solflare');
    setDeeplinkFailed(false);

    const ref = typeof window !== 'undefined' ? window.location.origin : '';
    const { scheme, https } = buildSolflareLinks(url, ref);

    if (isAndroid()) {
      let timedOut = false;
      setTimeout(() => {
        timedOut = true;
        try { window.open(https, '_blank', 'noopener'); } catch {}
      }, 350);
      try { markFlight('solflare'); setConfirm(null); window.location.href = scheme; } catch {}
      setTimeout(() => {
        if (document.visibilityState === 'visible' && !timedOut) {
          try { window.open(https, '_blank', 'noopener'); } catch {}
          setDeeplinkFailed(true);
        }
      }, 2500);
      return;
    }

    const started = Date.now();
    const fb = setTimeout(() => {
      if (document.visibilityState === 'visible' && Date.now() - started > 120) {
        try { window.location.href = https; } catch {}
      }
    }, 200);
    try { markFlight('solflare'); setConfirm(null); window.location.href = scheme; } catch { clearTimeout(fb); window.location.href = https; }
    setTimeout(() => { if (document.visibilityState === 'visible') setDeeplinkFailed(true); }, 2500);
  }

  async function handlePick(brand: Brand) {
    if (busy) return;
    setErr(null);
    setClicked(brand);

    const hit = mapByBrand.get(brand);
    const mobile = isMobileUA();
    const envHasWallet = hasInjectedWallet() || isWalletInAppUA();

    logEvent('wallet_connect_attempt', { brand });

    if (brand === 'walletconnect' && !hit?.adapterName) {
      setErr('WalletConnect is not configured.');
      setClicked(null);
      return;
    }

    if (mobile && !envHasWallet && (brand === 'phantom' || brand === 'solflare' || brand === 'backpack')) {
      const urlWithAC = withAutoConnect(currentUrl, brand as 'phantom'|'solflare'|'backpack');
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const solAndroidScheme = isAndroid() ? buildSolflareLinks(urlWithAC, origin).scheme : undefined;

      setConfirm({
        brand: brand as 'phantom' | 'solflare' | 'backpack',
        href:
          brand === 'phantom'  ? phantomBrowseLink(urlWithAC)  :
          brand === 'backpack' ? backpackBrowseLink(urlWithAC) :
          solAndroidScheme,
        mode: 'browse',
      });
      return;
    }

    if (!envHasWallet && !mobile && (brand === 'phantom' || brand === 'solflare' || brand === 'backpack') && (!hit?.adapterName || !hit.installed)) {
      window.open(INSTALL_URL[brand], '_blank', 'noopener,noreferrer');
      setClicked(null);
      return;
    }

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
            onClick={() => {
              const urlAC = withAutoConnect(currentUrl, 'phantom');
              logEvent('smart_connect_open_in_phantom', { inApp: isInAppBrowserUA() });
              setConfirm({ brand: 'phantom', href: phantomBrowseLink(urlAC), mode: 'browse' });
            }}
          >
            Open in Phantom
          </button>
          <button
            className="w-full rounded-lg py-2 text-sm border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => {
              logEvent('smart_connect_open_in_solflare', { inApp: isInAppBrowserUA() });
              setConfirm({ brand: 'solflare', mode: 'browse' });
            }}
          >
            Open in Solflare
          </button>
          <button
            className="w-full rounded-lg py-2 text-sm border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => {
              const urlAC = withAutoConnect(currentUrl, 'backpack');
              logEvent('smart_connect_open_in_backpack', { inApp: isInAppBrowserUA() });
              setConfirm({ brand: 'backpack', href: backpackBrowseLink(urlAC), mode: 'browse' });
            }}
          >
            Open in Backpack
          </button>
          <button
            className="w-full rounded-lg py-2 text-sm border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => { logEvent('smart_connect_walletconnect_hint'); alert('Use “WalletConnect” below to connect with other mobile wallets.'); }}
          >
            Other wallets (WalletConnect)
          </button>

          {/* Direct Connect (Phantom) — phase-2 */}
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
          <button className="px-3 py-1.5 text-xs rounded-md border border-white/15 bg-white/5 hover:bg-white/10" onClick={copyLink}>
            Copy link
          </button>
          <button className="px-3 py-1.5 text-xs rounded-md border border-white/15 bg-white/5 hover:bg-white/10" onClick={() => setShowSmart(false)}>
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
          </div>
        )}
      </div>
    );
  };

  const ConfirmLayer = () => {
    if (!confirm) return null;
    const { brand, mode = 'browse' } = confirm;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const urlAC =
      brand === 'phantom'  ? withAutoConnect(currentUrl, 'phantom')  :
      brand === 'backpack' ? withAutoConnect(currentUrl, 'backpack') :
                             withAutoConnect(currentUrl, 'solflare');

    const href =
      brand === 'phantom'  ? phantomBrowseLink(urlAC) :
      brand === 'backpack' ? backpackBrowseLink(urlAC) :
      (isAndroid() ? buildSolflareLinks(urlAC, origin).scheme : undefined);

    const continueHandler = async () => {
      if (mode === 'direct') {
        try {
          const { openDirectConnect } = await import('@/lib/wallet/direct/direct');
          await openDirectConnect('phantom', {
            appUrl: window.location.origin,
            redirectLink: `${window.location.origin}/wallet/callback/phantom`,
          });
          logEvent('direct_connect_done', { provider: 'phantom' });
        } catch {
          alert('Direct Connect failed to start.');
        } finally {
          setConfirm(null);
        }
        return;
      }

      if (brand === 'solflare' && !href) {
        launchSolflare(urlAC);
        setConfirm(null);
      }
    };

    return (
      <RedirectConfirm
        open
        brand={brand}
        mode={mode}
        href={href}
        onCancel={() => setConfirm(null)}
        onContinue={continueHandler}
        onResolved={() => setConfirm(null)}   // ✅ navigasyon öncesi kapat
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogOverlay className="z-[90] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200" />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-2xl w-[92vw] max-w-md max-h-[85vh] overflow-y-auto overscroll-contain z-[100] shadow-2xl border border-white/10 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-1 sm:data-[state=open]:slide-in-from-bottom-2 duration-250">
        <div className="sticky top-0 -m-6 px-6 pt-3 pb-2 z-[100] flex items-center justify-between pointer-events-none">
          <DialogTitle className="text-white/95 text-base font-semibold pointer-events-auto">Connect a Solana wallet</DialogTitle>
          <button onClick={onClose} aria-label="Close" className="pointer-events-auto inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="h-6 sm:h-8" />
        <DialogDescription className="sr-only">Choose a wallet to connect.</DialogDescription>

        {/* Smart Panel */}
        <SmartPanel />

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 sm:mt-8 touch-pan-y">
          {UI.map(({ key, label, note, desc }) => {
            const hit = (mapByBrand.get(key) || { installed: false }) as { installed: boolean; adapterName?: string };
            const isBusy = busy && clicked === key;
            const isLast = last === key;
            const badge =
              key === 'walletconnect' ? { text: 'QR',        cls: 'bg-indigo-600/30 border-indigo-500/50' } :
              hit.installed           ? { text: 'Installed', cls: 'bg-emerald-600/30 border-emerald-500/50' } :
                                        { text: 'Install',   cls: 'bg-zinc-700/50   border-zinc-500/50' };

            return (
              <motion.button
                key={key}
                layout
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handlePick(key)}
                disabled={busy}
                className="relative grid grid-rows-[auto_1fr_auto] h-[8.5rem] rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.07] pl-4 pr-14 pt-5 pb-3 overflow-hidden outline-none focus:outline-none select-none"
              >
                {isLast && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-emerald-400/40" />}
                <span className={`absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.text}</span>
                <div className="relative z-10 flex items-center gap-2">
                  <WalletBrandBadge brand={key} size={24} className="h-6 w-6 shrink-0" />
                  <span className="font-semibold">{label}</span>
                </div>
                <div className="relative z-10 text-xs text-gray-300 mt-2 self-start" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {desc}{note ? ` — ${note}` : ''}
                </div>
                {!hit.installed && key !== 'walletconnect' && !isMobileUA() && (
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

        {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
      </DialogContent>

      {/* Heads-up confirm */}
      <ConfirmLayer />
    </Dialog>
  );
}
