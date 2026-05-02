// components/HomePage.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import CountUp from 'react-countup';
import AppWalletBar from '@/components/AppWalletBar';

import CoincarneModal from '@/components/CoincarneModal';
import Skeleton from '@/components/ui/Skeleton';

import { useWalletTokens, TokenInfo } from '@/hooks/useWalletTokens';
import { useChain } from '@/app/providers/ChainProvider';
import AdminLink from '@/components/admin/AdminLink';

// PROD'da 15s, DEV'de 20s polling
const POLL_MS = 0;

const LIVE_ACTIVITY_REFRESH_MS = 30_000;
const LIVE_ACTIVITY_CLOCK_TICK_MS = 60_000;
const ACTIVITY_RECENT_WINDOW_MS = 10 * 60 * 1000;
const ACTIVITY_HOT_BURST_WINDOW_MS = 2 * 60 * 1000;
const ACTIVITY_TRENDING_WINDOW_MS = 10 * 60 * 1000;

type LiveActivityItem = {
  tokenSymbol: string | null;
  tokenName: string | null;
  tokenContract: string;
  shortMint: string;
  walletAddress: string;
  shortWallet: string;
  usdValue: number;
  timestamp: string;
  logoURI: string | null;
  status?: string | null;
};

type LiveActivityCluster = LiveActivityItem & {
  occurrenceCount: number;
  uniqueWalletCount: number;
  totalUsdValue: number;
  latestTimestamp: string;
  timestamps: string[];
  walletAddresses: string[];
};

export default function HomePage() {
  const router = useRouter();
  const { chain } = useChain(); // 'solana'
  const { publicKey, connected } = useWallet();
  const pubkeyBase58 = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);

  const {
    tokens,
    loading: tokensLoading,
    refreshing,
    error: tokensError,
    refetchTokens,
  } = useWalletTokens({
    autoRefetchOnFocus: true,
    autoRefetchOnAccountChange: true,
    pollMs: POLL_MS,
  });

  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showSolModal, setShowSolModal] = useState(false);
  const [autoOpenHandledMint, setAutoOpenHandledMint] = useState<string | null>(null);
  const [liveActivity, setLiveActivity] = useState<LiveActivityCluster[]>([]);
  const [liveActivityLoading, setLiveActivityLoading] = useState(false);
  const [liveActivityError, setLiveActivityError] = useState<string | null>(null);
  const [coinFlowNotice, setCoinFlowNotice] = useState<string | null>(null);
  const [coinFlowOverlay, setCoinFlowOverlay] = useState<{
    title: string;
    message: string;
    tone: 'info' | 'success' | 'warning';
  } | null>(null);
  const [tokenSelectorSpotlight, setTokenSelectorSpotlight] = useState(false);
  const [tokenSelectorHint, setTokenSelectorHint] = useState(false);
  const pendingRefetchRequestedMintRef = useRef<string | null>(null);
  const coinFlowOverlayTimerRef = useRef<number | null>(null);
  const tokenSelectRef = useRef<HTMLSelectElement | null>(null);
  const pendingModalOpenTimerRef = useRef<number | null>(null);
  const pendingWalletSyncOverlayShownRef = useRef<string | null>(null);

  function formatTokenAmount(token: TokenInfo) {
    if (typeof token.uiAmountString === 'string' && token.uiAmountString.trim()) {
      const n = Number(token.uiAmountString);
      if (Number.isFinite(n)) {
        if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
        return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
      }
      return token.uiAmountString;
    }

    if (typeof token.amount === 'number' && Number.isFinite(token.amount)) {
      if (token.amount >= 1000) return token.amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
      if (token.amount >= 1) return token.amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
      return token.amount.toLocaleString('en-US', { maximumFractionDigits: 6 });
    }

    return '0';
  }

  function formatNumberCompact(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '0';
  
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }

  function ShareArrowIcon({ className = '' }: { className?: string }) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 17L17 7" />
        <path d="M9 7h8v8" />
      </svg>
    );
  }

  function getStatusBadgeClass(status: string) {
    const base = 'rounded-full px-2 py-0.5 text-[10px] border whitespace-nowrap';

    if (status === 'healthy') {
      return `${base} bg-emerald-500/10 text-emerald-200 border-emerald-400/30`;
    }

    if (status === 'walking_dead') {
      return `${base} bg-amber-500/10 text-amber-200 border-amber-400/30`;
    }

    if (status === 'deadcoin') {
      return `${base} bg-zinc-500/10 text-zinc-200 border-zinc-400/30`;
    }

    if (status === 'redlist') {
      return `${base} bg-rose-500/10 text-rose-200 border-rose-400/30`;
    }

    if (status === 'blacklist') {
      return `${base} bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-400/30`;
    }

    return `${base} bg-white/5 text-gray-300 border-white/10`;
  }

  function formatStatusLabel(status: string) {
    if (status === 'walking_dead') return 'Walking Dead';
    if (status === 'deadcoin') return 'Deadcoin';
    if (status === 'healthy') return 'Healthy';
    if (status === 'redlist') return 'Redlist';
    if (status === 'blacklist') return 'Blacklist';
    return status;
  }

  function getClusterBadgeClass(count: number) {
    const base =
      'rounded-full px-2 py-1 text-[10px] font-semibold whitespace-nowrap border';

    if (count >= 10) {
      return `${base} bg-orange-500/15 text-orange-300 border-orange-400/40 animate-pulse`;
    }

    if (count >= 7) {
      return `${base} bg-amber-500/10 text-amber-200 border-amber-400/30`;
    }

    if (count >= 4) {
      return `${base} bg-emerald-500/10 text-emerald-200 border-emerald-400/30`;
    }

    return `${base} bg-cyan-500/10 text-cyan-200 border-cyan-400/30`;
  }

  function formatRelativeTimeEnhanced(value: string, now: number) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Recently';

    const diffSec = Math.max(0, Math.floor((now - d.getTime()) / 1000));

    if (diffSec < 10) return '🔥 Hot';
    if (diffSec < 60) return '⚡ Now';
    if (diffSec < 300) return '🟢 Recently';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;

    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  }

  function getTimeGlow(timestamp: string, now: number) {
    const diff = now - new Date(timestamp).getTime();

    const sec = diff / 1000;
    const min = sec / 60;

    if (sec < 120) {
      return 'shadow-[0_0_40px_rgba(16,185,129,0.35)]';
    }

    if (min < 10) {
      return 'shadow-[0_0_25px_rgba(16,185,129,0.25)]';
    }

    if (min < 60) {
      return 'shadow-[0_0_15px_rgba(34,211,238,0.18)]';
    }

    return '';
  }

  function isUltraFresh(timestamp: string, now: number) {
    return now - new Date(timestamp).getTime() < 10 * 1000;
  }

  function getActivityDisplayLimit() {
    return 9;
  }

  function getActivityFetchLimit() {
    return 27;
  }

  function countTimestampsWithinWindow(
    timestamps: string[],
    now: number,
    windowMs: number
  ) {
    return timestamps.reduce((count, ts) => {
      const time = new Date(ts).getTime();
      if (Number.isNaN(time)) return count;
      return now - time <= windowMs ? count + 1 : count;
    }, 0);
  }

  function getHeatLevel(cluster: LiveActivityCluster, now: number) {
    const hotCount = countTimestampsWithinWindow(
      cluster.timestamps,
      now,
      ACTIVITY_HOT_BURST_WINDOW_MS
    );

    const trendingCount = countTimestampsWithinWindow(
      cluster.timestamps,
      now,
      ACTIVITY_TRENDING_WINDOW_MS
    );

    if (hotCount >= 3) return 'hot';
    if (trendingCount >= 5) return 'trending';
    return 'live';
  }

  function getHeatBadgeClass(level: 'hot' | 'trending' | 'live') {
    const base =
      'rounded-full px-2 py-1 text-[10px] font-medium whitespace-nowrap border';

    if (level === 'hot') {
      return `${base} border-orange-400/40 bg-orange-500/15 text-orange-200 animate-pulse`;
    }

    if (level === 'trending') {
      return `${base} border-cyan-400/35 bg-cyan-500/10 text-cyan-200`;
    }

    return `${base} border-emerald-400/30 bg-emerald-500/10 text-emerald-200`;
  }

  function getHeatLabel(level: 'hot' | 'trending' | 'live') {
    if (level === 'hot') return '🔥 HOT';
    if (level === 'trending') return '⚡ TRENDING';
    return '🟢 LIVE';
  }

  function getClusterGlowClass(cluster: LiveActivityCluster, now: number) {
    const level = getHeatLevel(cluster, now);

    if (level === 'hot') {
      return 'shadow-[0_0_40px_rgba(249,115,22,0.24)]';
    }

    if (level === 'trending') {
      return 'shadow-[0_0_28px_rgba(34,211,238,0.18)]';
    }

    return getTimeGlow(cluster.timestamp, now);
  }

  function getShareButtonClass(level: 'hot' | 'trending' | 'live') {
    const base =
      'flex items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] text-cyan-100 transition-all duration-200';

    if (level === 'hot') {
      return `${base} border-orange-400/35 bg-orange-500/[0.10] text-orange-100 shadow-[0_0_22px_rgba(249,115,22,0.34)] hover:bg-orange-500/[0.16] hover:shadow-[0_0_32px_rgba(249,115,22,0.46)] animate-pulse`;
    }

    if (level === 'trending') {
      return `${base} border-cyan-300/35 bg-cyan-500/[0.09] shadow-[0_0_18px_rgba(34,211,238,0.26)] hover:bg-cyan-500/[0.15] hover:shadow-[0_0_28px_rgba(34,211,238,0.36)]`;
    }

    return `${base} shadow-[0_0_12px_rgba(34,211,238,0.12)] hover:bg-cyan-500/[0.12] hover:shadow-[0_0_22px_rgba(34,211,238,0.24)]`;
  }

  function canShareStatus(status?: string | null) {
    return status !== 'redlist' && status !== 'blacklist';
  }

  function canCoincarnateStatus(status?: string | null) {
    return status !== 'redlist' && status !== 'blacklist';
  }
  
  function getCoincarnateDisabledClass() {
    return [
      'flex items-center justify-center rounded-xl border border-white/10',
      'bg-white/[0.03] text-gray-500 opacity-45 cursor-not-allowed',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_6px_16px_rgba(0,0,0,0.12)]',
      'backdrop-blur-sm',
    ].join(' ');
  }

  function hasPendingCoincarnateScan() {
    if (typeof window === 'undefined') return false;
    return !!safeReadPendingCoincarnateMint();
  }
  
  function getShareButtonDisabledClass() {
    return [
      'flex items-center justify-center rounded-xl border border-white/10',
      'bg-white/[0.03] text-gray-500 opacity-45 cursor-not-allowed',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_6px_16px_rgba(0,0,0,0.12)]',
      'backdrop-blur-sm',
    ].join(' ');
  }

  function safeReadPendingCoincarnateMint(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      const mint = sessionStorage.getItem('coincarnate_target_mint');
      return mint && mint.trim() ? mint.trim() : null;
    } catch {
      return null;
    }
  }

  function safeReadPendingCoincarnateSymbol(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      const symbol = sessionStorage.getItem('coincarnate_target_symbol');
      return symbol && symbol.trim() ? symbol.trim() : null;
    } catch {
      return null;
    }
  }

  function safeReadPendingCoincarnateName(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      const name = sessionStorage.getItem('coincarnate_target_name');
      return name && name.trim() ? name.trim() : null;
    } catch {
      return null;
    }
  }

  function clearPendingCoincarnateMint() {
    try {
      sessionStorage.removeItem('coincarnate_target_mint');
      sessionStorage.removeItem('coincarnate_target_symbol');
      sessionStorage.removeItem('coincarnate_target_name');
    } catch { }
  }

  function showCoinFlowNotice(message: string) {
    setCoinFlowNotice(message);
    window.setTimeout(() => setCoinFlowNotice(null), 4200);
  }

  function dismissCoinFlowOverlay() {
    if (coinFlowOverlayTimerRef.current) {
      clearTimeout(coinFlowOverlayTimerRef.current);
      coinFlowOverlayTimerRef.current = null;
    }

    setCoinFlowOverlay(null);
  }

  function showCoinFlowOverlay(
    title: string,
    message: string,
    tone: 'info' | 'success' | 'warning' = 'info',
    duration = 5000
  ) {
    if (coinFlowOverlayTimerRef.current) {
      clearTimeout(coinFlowOverlayTimerRef.current);
      coinFlowOverlayTimerRef.current = null;
    }

    setCoinFlowOverlay({ title, message, tone });

    window.setTimeout(() => {
      coinFlowOverlayTimerRef.current = window.setTimeout(() => {
        setCoinFlowOverlay(null);
        coinFlowOverlayTimerRef.current = null;
      }, duration);
    }, 120);
  }

  function revealTokenSelectorAfterScan() {
    window.setTimeout(() => {
      const select = tokenSelectRef.current;
      if (!select) return;

      setTokenSelectorSpotlight(true);
      setTokenSelectorHint(true);

      select.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      window.setTimeout(() => {
        select.focus();

        try {
          const maybeSelect = select as HTMLSelectElement & {
            showPicker?: () => void;
          };

          maybeSelect.showPicker?.();
        } catch { }

        window.setTimeout(() => {
          setTokenSelectorSpotlight(false);
          setTokenSelectorHint(false);
        }, 3200);
      }, 650);
    }, 1500);
  }

  function startCoincarnateFlow(
    mint: string,
    symbol?: string | null,
    name?: string | null
  ) {
    if (typeof window === 'undefined') return;

    const cleanSymbol = String(symbol || '').trim();
    const cleanName = String(name || '').trim();

    try {
      sessionStorage.setItem('coincarnate_target_mint', mint);

      if (cleanSymbol) {
        sessionStorage.setItem('coincarnate_target_symbol', cleanSymbol);
      } else {
        sessionStorage.removeItem('coincarnate_target_symbol');
      }

      if (cleanName) {
        sessionStorage.setItem('coincarnate_target_name', cleanName);
      } else {
        sessionStorage.removeItem('coincarnate_target_name');
      }
    } catch { }

    window.location.href = '/';
  }

  function shortenWalletCompact(value: string) {
    if (!value) return '';
    if (value.length <= 8) return value;
    return `${value.slice(0, 3)}...${value.slice(-2)}`;
  }

  function shortenMint(value: string) {
    if (!value) return '';
    if (value.length <= 12) return value;
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  function normalizeMint(value: string | null | undefined) {
    return String(value || '').trim().toLowerCase();
  }

  function pickShareLine(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  
  function getStatusShareOpeners(symbol: string, status: string) {
    if (status === 'healthy') {
      return [
        `😳 Even ${symbol} is being coincarnated now.`,
        `👀 Seeing ${symbol} on Coincarnation feels unreal.`,
        `🔥 ${symbol} on Coincarnation? This is getting serious.`,
      ];
    }
  
    if (status === 'walking_dead') {
      return [
        `🧟 ${symbol} is officially a walking deadcoin on Coincarnation.`,
        `⚠️ ${symbol} showing walking dead signals here feels too familiar.`,
        `🪦 ${symbol} was already halfway gone anyway.`,
      ];
    }
  
    if (status === 'deadcoin') {
      return [
        `☠️ ${symbol} is now a deadcoin on Coincarnation.`,
        `🪦 Seeing ${symbol} here hurts... but makes sense.`,
        `⚰️ ${symbol} finally found its Coincarnation route.`,
      ];
    }
  
    return [
      `👀 ${symbol} is showing up on Coincarnation.`,
      `⚠️ ${symbol} is drawing Coincarnation attention.`,
    ];
  }
  
  function getStatusSharePsychology(status: any) {
    if (status === 'healthy') {
        return [
            `People are coincarnating even solid bags now.`,
            `This thing is spreading way beyond deadcoins.`,
            `Healthy coins entering this is not a small signal.`,
        ];
    }

    if (status === 'walking_dead') {
        return [
            `Too many of us know this feeling.`,
            `Almost every wallet has one of these.`,
            `This is painfully relatable.`,
        ];
    }

    if (status === 'deadcoin') {
        return [
            `Every wallet has a graveyard.`,
            `Finally a use for dead bags.`,
            `This actually makes dead losses useful.`,
        ];
    }

    return [
        `Crypto has been needing this.`,
        `Hard not to notice this anymore.`,
    ];
  }
  
  function getShareCloserLine() {
    return pickShareLine([
        `What are you sending in? #Coincarnation`,
        `This might get crowded fast. #Coincarnation`,
        `Feels early... maybe too early. #Coincarnation`,
        `Hard not to think about joining. #Coincarnation`,
        `This is getting harder to ignore. #Coincarnation`,
    ]);
  }

  function buildDynamicTweet(item: LiveActivityCluster) {
    const symbol = item.tokenSymbol ? `$${item.tokenSymbol}` : item.shortMint;
    const status = item.status || 'unknown';
  
    const tweetLines = [
      pickShareLine(getStatusShareOpeners(symbol, status)),
      '',
      pickShareLine(getStatusSharePsychology(status)),
      '',
      getShareCloserLine(),
    ];
  
    return tweetLines.join('\n');
  }

  async function openXIntent(
    text: string,
    onCopied?: (message: string) => void
  ) {
    const shareUrl = 'https://coincarnation.com';
    const fullText = `${text}\n\n${shareUrl}`;

    const ua =
      typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';

    const isCoarsePointer =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    const w = typeof window !== 'undefined' ? (window as any) : {};

    const isPhantom = ua.includes('phantom');
    const isBackpack = ua.includes('backpack');

    const isSolflareProvider =
      Boolean(w.solflare) ||
      Boolean(w.solana?.isSolflare) ||
      Boolean(w.solana?.isSolflareWallet);

    const isLikelySolflare =
      ua.includes('solflare') ||
      (isCoarsePointer && isSolflareProvider);

    const isWalletLike =
      isPhantom ||
      isBackpack ||
      isLikelySolflare;

    async function copyTextFallback() {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(fullText);
          return true;
        }

        const ta = document.createElement('textarea');
        ta.value = fullText;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);

        return ok;
      } catch {
        return false;
      }
    }

    // ✅ 1) Wallet browsers → COPY ONLY
    if (isWalletLike) {
      const copied = await copyTextFallback();

      if (copied) {
        onCopied?.('Post copied. Open X and paste.');
      } else {
        onCopied?.('Could not auto-copy. Please copy manually and share on X.');
      }

      return;
    }

    // ✅ 2) REAL mobile browsers (Safari + Chrome)
    if (isCoarsePointer && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          text: fullText,
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }

        // fallback
      }
    }

    // ✅ 3) Desktop fallback
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullText)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
  }

  async function shareClusterOnX(item: LiveActivityCluster) {
    if (typeof window === 'undefined') return;
    if (!canShareStatus(item.status)) return;
  
    const text = buildDynamicTweet(item);
  
    await openXIntent(text, (message) => {
      setLiveActivityError(message);
      window.setTimeout(() => setLiveActivityError(null), 3600);
    });
  }

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (hasPendingCoincarnateScan()) return;

    const mint = e.target.value;
  
    const token = tokens.find((t) => t.mint === mint) || null;
  
    if (!token) {
      setSelectedToken(null);
      setShowSolModal(false);
      return;
    }
  
    const numericAmount =
      typeof token.amount === 'number' && Number.isFinite(token.amount)
        ? token.amount
        : Number(token.uiAmountString || 0);
  
    const hasValidAmount = Number.isFinite(numericAmount) && numericAmount > 0;
  
    if (!hasValidAmount) {
      setSelectedToken(null);
      setShowSolModal(false);
      return;
    }
  
    setSelectedToken(token);
    setShowSolModal(true);
  };
  const [globalStats, setGlobalStats] = useState({
    totalUsd: 0,
    totalParticipants: 0,
    uniqueDeadcoins: 0,
    mostPopularDeadcoin: '',
    corePointGenerated: 0,
  });
  const [userContribution, setUserContribution] = useState(0);

  const [activityNow, setActivityNow] = useState(() => Date.now());

  async function loadLiveActivity(signal?: AbortSignal) {
    try {
      setLiveActivityLoading(true);
      setLiveActivityError(null);

      const displayLimit = getActivityDisplayLimit();
      const fetchLimit = getActivityFetchLimit();

      const res = await fetch(`/api/live-activity?limit=${fetchLimit}`, {
        cache: 'no-store',
        signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const incoming = Array.isArray(data?.items) ? data.items : [];

      const grouped = new Map<string, LiveActivityCluster>();

      for (const item of incoming as LiveActivityItem[]) {
        const existing = grouped.get(item.tokenContract);

        if (!existing) {
          grouped.set(item.tokenContract, {
            ...item,
            occurrenceCount: 1,
            uniqueWalletCount: item.walletAddress ? 1 : 0,
            totalUsdValue: Number(item.usdValue || 0),
            latestTimestamp: item.timestamp,
            timestamps: [item.timestamp],
            walletAddresses: item.walletAddress ? [item.walletAddress] : [],
          });
          continue;
        }

        const isNewer =
          new Date(item.timestamp).getTime() > new Date(existing.latestTimestamp).getTime();

        const mergedWalletAddresses = item.walletAddress
          ? Array.from(new Set([...existing.walletAddresses, item.walletAddress]))
          : existing.walletAddresses;

        const mergedTimestamps = [...existing.timestamps, item.timestamp];

        grouped.set(item.tokenContract, {
          ...existing,
          occurrenceCount: existing.occurrenceCount + 1,
          totalUsdValue: Number(existing.totalUsdValue || 0) + Number(item.usdValue || 0),
          latestTimestamp: isNewer ? item.timestamp : existing.latestTimestamp,
          walletAddress: isNewer ? item.walletAddress : existing.walletAddress,
          shortWallet: isNewer ? item.shortWallet : existing.shortWallet,
          tokenSymbol: isNewer ? item.tokenSymbol : existing.tokenSymbol,
          tokenName: isNewer ? item.tokenName : existing.tokenName,
          logoURI: isNewer ? item.logoURI : existing.logoURI,
          status: isNewer ? item.status : existing.status,
          shortMint: isNewer ? item.shortMint : existing.shortMint,
          usdValue: isNewer ? item.usdValue : existing.usdValue,
          timestamp: isNewer ? item.timestamp : existing.timestamp,
          uniqueWalletCount: mergedWalletAddresses.length,
          walletAddresses: mergedWalletAddresses,
          timestamps: mergedTimestamps,
        });
      }

      const clustered = Array.from(grouped.values())
        .sort(
          (a, b) =>
            new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime()
        )
        .slice(0, displayLimit);

      setLiveActivity(clustered);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setLiveActivityError(e?.message || 'Could not load live activity.');
    } finally {
      setLiveActivityLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();

    void loadLiveActivity(ac.signal);

    const refreshId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadLiveActivity();
    }, LIVE_ACTIVITY_REFRESH_MS);

    const tickId = window.setInterval(() => {
      setActivityNow(Date.now());
    }, LIVE_ACTIVITY_CLOCK_TICK_MS);

    const handleFocus = () => {
      void loadLiveActivity();
      setActivityNow(Date.now());
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadLiveActivity();
        setActivityNow(Date.now());
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      ac.abort();
      window.clearInterval(refreshId);
      window.clearInterval(tickId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/coincarnation/stats', { cache: 'no-store', signal: ac.signal });
        const data = await res.json();
        if ((data as any)?.success) setGlobalStats(data);
      } catch { }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!pubkeyBase58 || !connected) return;
    const ac = new AbortController();
    (async () => {
      try {
        const [globalRes, userRes] = await Promise.all([
          fetch('/api/coincarnation/stats', { cache: 'no-store', signal: ac.signal }),
          fetch(`/api/claim/${pubkeyBase58}`, { cache: 'no-store', signal: ac.signal }),
        ]);
        const globalData = await globalRes.json().catch(() => ({}));
        const userData = await userRes.json().catch(() => ({}));
        if ((globalData as any)?.success) setGlobalStats(globalData);
        if ((userData as any)?.success) {
          setUserContribution(Number((userData as any)?.data?.total_usd_contributed || 0));
        }
      } catch { }
    })();
    return () => ac.abort();
  }, [pubkeyBase58, connected]);

  useEffect(() => {
    if (!connected || !pubkeyBase58) return;

    const t1 = setTimeout(() => {
      refetchTokens?.();
    }, 350);

    const t2 = setTimeout(() => {
      refetchTokens?.();
    }, 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [connected, pubkeyBase58, refetchTokens]);

  useEffect(() => {
    if (!selectedToken) return;

    const fresh = tokens.find((t) => t.mint === selectedToken.mint);
    if (!fresh) return;

    const changed =
      fresh.symbol !== selectedToken.symbol ||
      fresh.name !== selectedToken.name ||
      fresh.logoURI !== selectedToken.logoURI ||
      fresh.amount !== selectedToken.amount ||
      fresh.uiAmountString !== selectedToken.uiAmountString;

    if (changed) {
      setSelectedToken(fresh);
    }
  }, [tokens, selectedToken]);

  useEffect(() => {
    return () => {
      if (coinFlowOverlayTimerRef.current) {
        clearTimeout(coinFlowOverlayTimerRef.current);
        coinFlowOverlayTimerRef.current = null;
      }
  
      if (pendingModalOpenTimerRef.current) {
        clearTimeout(pendingModalOpenTimerRef.current);
        pendingModalOpenTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pendingMint = safeReadPendingCoincarnateMint();
    if (!pendingMint) return;

    const pendingSymbol = safeReadPendingCoincarnateSymbol();
    const pendingName = safeReadPendingCoincarnateName();

    const pendingLabel = pendingSymbol
      ? `$${pendingSymbol}`
      : pendingName
        ? pendingName
        : shortenMint(pendingMint);

    const pendingKey = normalizeMint(pendingMint);

    if (autoOpenHandledMint && normalizeMint(autoOpenHandledMint) === pendingKey) {
      clearPendingCoincarnateMint();
      pendingRefetchRequestedMintRef.current = null;
      pendingWalletSyncOverlayShownRef.current = null;
      return;
    }

    // Wallet is not connected yet.
    // Do NOT clear pendingMint. User may connect wallet after this notice.
    if (!connected || !pubkeyBase58) {
      showCoinFlowOverlay(
        'Wallet Required',
        'Connect your wallet to participate in Coincarnation.',
        'warning',
        2500
      );
      return;
    }

    if (pendingWalletSyncOverlayShownRef.current !== pendingKey) {
      pendingWalletSyncOverlayShownRef.current = pendingKey;
    
      showCoinFlowOverlay(
        'Wallet Syncing',
        'Scanning wallet assets for pending Coincarnation target...',
        'info',
        2200
      );
    }

    // Wallet is connected, but token sync is still running.
    if (tokensLoading || refreshing) return;

    // If token list is empty, force one extra refetch before deciding.
    if (tokens.length === 0 && pendingRefetchRequestedMintRef.current !== pendingKey) {
      pendingRefetchRequestedMintRef.current = pendingKey;
      showCoinFlowOverlay(
        'Scanning Wallet',
        'Syncing your wallet tokens...',
        'info',
        1300
      );
      refetchTokens?.();
      return;
    }

    const matchedToken = tokens.find(
      (t) => normalizeMint(t.mint) === pendingKey
    );

    if (!matchedToken) {
      clearPendingCoincarnateMint();
      setAutoOpenHandledMint(pendingMint);
      pendingRefetchRequestedMintRef.current = null;
      pendingWalletSyncOverlayShownRef.current = null;

      showCoinFlowOverlay(
        'Coincarnation Scan Complete',
        `${pendingLabel} was not detected in your connected wallet. Choose another token from your wallet to continue.`,
        'warning',
        2500
      );

      revealTokenSelectorAfterScan();
      return;
    }

    const numericAmount =
      typeof matchedToken.amount === 'number' && Number.isFinite(matchedToken.amount)
        ? matchedToken.amount
        : Number(matchedToken.uiAmountString || 0);

    const hasValidAmount = Number.isFinite(numericAmount) && numericAmount > 0;

    if (!hasValidAmount) {
      clearPendingCoincarnateMint();
      setAutoOpenHandledMint(pendingMint);
      pendingRefetchRequestedMintRef.current = null;
      pendingWalletSyncOverlayShownRef.current = null;

      showCoinFlowOverlay(
        'Coincarnation Scan Complete',
        `${pendingLabel} was detected, but no valid balance was found. Choose another token from your wallet to continue.`,
        'warning',
        2500
      );

      revealTokenSelectorAfterScan();
      return;
    }

    showCoinFlowOverlay(
      'Coincarnation Scan Complete',
      `${pendingLabel} detected. Preparing Coincarnation...`,
      'success',
      1000
    );

    setSelectedToken(matchedToken);

    if (pendingModalOpenTimerRef.current) {
      clearTimeout(pendingModalOpenTimerRef.current);
    }
    
    pendingModalOpenTimerRef.current = window.setTimeout(() => {
      setShowSolModal(true);
      pendingModalOpenTimerRef.current = null;
    }, 1250);

    clearPendingCoincarnateMint();
    setAutoOpenHandledMint(pendingMint);
    pendingRefetchRequestedMintRef.current = null;
    pendingWalletSyncOverlayShownRef.current = null;
  }, [
    connected,
    pubkeyBase58,
    tokens,
    tokensLoading,
    refreshing,
    refetchTokens,
    autoOpenHandledMint,
  ]);

  const shareRatio = globalStats.totalUsd > 0 ? userContribution / globalStats.totalUsd : 0;
  const sharePercentage = Math.max(0, Math.min(100, shareRatio * 100)).toFixed(2);
  const generatedCorePoint = Math.round(Number(globalStats.corePointGenerated || 0));

  const recentActivityCount = useMemo(() => {
    return liveActivity.filter(
      (item) => activityNow - new Date(item.timestamp).getTime() < ACTIVITY_RECENT_WINDOW_MS
    ).length;
  }, [liveActivity, activityNow]);

  const totalClusteredCoincarnations = useMemo(() => {
    return liveActivity.reduce((sum, item) => sum + item.occurrenceCount, 0);
  }, [liveActivity]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white flex flex-col items-center px-6 pt-4 pb-6 space-y-8">
      {coinFlowOverlay && (
        <div
          onClick={dismissCoinFlowOverlay}
          className="fixed inset-0 z-[130] flex cursor-pointer items-start justify-center bg-black/45 px-4 pt-24 backdrop-blur-[6px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={[
              'w-full max-w-md overflow-hidden rounded-[26px] border px-5 py-4 text-center shadow-[0_30px_90px_rgba(0,0,0,0.55)]',
              coinFlowOverlay.tone === 'success'
                ? 'border-emerald-400/25 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_34%),linear-gradient(180deg,rgba(8,18,16,0.96),rgba(5,10,14,0.96))] text-emerald-100'
                : coinFlowOverlay.tone === 'warning'
                  ? 'border-amber-400/25 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_34%),linear-gradient(180deg,rgba(18,14,8,0.96),rgba(7,10,14,0.96))] text-amber-100'
                  : 'border-cyan-400/25 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_34%),linear-gradient(180deg,rgba(8,15,24,0.96),rgba(5,10,16,0.96))] text-cyan-100',
            ].join(' ')}
          >
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
              {coinFlowOverlay.tone === 'success' ? '✓' : coinFlowOverlay.tone === 'warning' ? '!' : '⌁'}
            </div>

            <div className="text-sm font-bold uppercase tracking-[0.16em]">
              {coinFlowOverlay.title}
            </div>

            <div className="mt-2 text-sm leading-6 text-white/80">
              {coinFlowOverlay.message}
            </div>
          </div>
        </div>
      )}
      {coinFlowNotice && (
        <div className="fixed left-1/2 top-5 z-[120] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-2xl border border-cyan-400/25 bg-[#0b1425]/95 px-4 py-3 text-sm font-semibold text-cyan-100 shadow-[0_18px_60px_rgba(0,0,0,0.45),0_0_30px_rgba(34,211,238,0.14)] backdrop-blur">
          {coinFlowNotice}
        </div>
      )}
      <AppWalletBar className="w-full max-w-5xl" />

      {/* Hero */}
      <section className="text-center pt-2 pb-2 w-full">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-2">
          Turn Deadcoins into a Fair Future.
        </h1>
        <p className="text-lg md:text-xl text-pink-400 mb-1">
          This is not a swap. This is reincarnation.
        </p>
        <p className="text-sm text-gray-300 max-w-xl mx-auto">
          Burning wealth inequality. One deadcoin at a time.
        </p>
      </section>

      <div className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.13),transparent_32%),linear-gradient(180deg,rgba(20,26,40,0.96),rgba(13,17,28,0.98))] p-5 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.34),0_0_42px_rgba(34,211,238,0.08),0_0_54px_rgba(168,85,247,0.08)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[30px] before:bg-[linear-gradient(135deg,rgba(34,211,238,0.22),transparent_28%,rgba(168,85,247,0.18)_62%,transparent_82%)] before:opacity-60">
        <div className="relative z-[1]">
          <h2 className="text-lg mb-1 text-left">You give</h2>
          <p className="text-xs text-gray-400 text-left mb-2">
            Walking deadcoins, memecoins, any unsupported assets…
          </p>

          {/* -------- SADECE SOLANA -------- */}
          {publicKey ? (
            <>
              {tokensLoading && tokens.length === 0 ? (
                <div className="space-y-2 mb-4" aria-busy="true">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  {refreshing && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                      <span className="inline-block h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      <span>Syncing tokens…</span>
                    </div>
                  )}

                  <label className="sr-only" htmlFor="token-select">
                    Select a token to Coincarnate
                  </label>

                  <div
                    className={[
                      'relative mb-2 rounded-2xl border p-[1px] transition-all duration-300',
                      'bg-[linear-gradient(135deg,rgba(34,211,238,0.35),rgba(168,85,247,0.18),rgba(16,185,129,0.18))]',
                      tokenSelectorSpotlight
                        ? 'border-cyan-300/60 shadow-[0_0_34px_rgba(34,211,238,0.45)] ring-2 ring-cyan-400/25'
                        : 'border-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.22)]',
                    ].join(' ')}
                  >
                    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_32%)]" />

                    <div className="relative flex items-center gap-3 rounded-2xl bg-[#07111f]/95 px-3 py-2.5 backdrop-blur-xl">

                      <select
                        ref={tokenSelectRef}
                        id="token-select"
                        className={[
                          'min-w-0 flex-1 appearance-none bg-transparent py-1 pl-1 pr-8 text-sm font-semibold text-white outline-none [color-scheme:dark]',
                          tokensLoading || refreshing || hasPendingCoincarnateScan()
                            ? 'cursor-not-allowed opacity-60'
                            : 'cursor-pointer',
                        ].join(' ')}
                        value={selectedToken?.mint || ''}
                        onChange={handleSelectChange}
                        disabled={tokensLoading || refreshing || hasPendingCoincarnateScan()}
                      >
                        <option
                          value=""
                          disabled
                          className="bg-slate-950 text-slate-300"
                        >
                          Select a token to Coincarnate
                        </option>

                        {tokens.map((token) => {
                          const sym = (token.symbol ?? token.mint.slice(0, 6)).toUpperCase();
                          const name = token.name?.trim();
                          const amt = formatTokenAmount(token);

                          const label =
                            name && name.toUpperCase() !== sym
                              ? `${sym} — ${name} — ${amt}`
                              : `${sym} — ${amt}`;

                          return (
                            <option
                              key={token.mint}
                              value={token.mint}
                              className="bg-slate-950 text-white"
                            >
                              {label}
                            </option>
                          );
                        })}
                      </select>

                      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-cyan-200">
                        ▾
                      </div>
                    </div>
                  </div>

                  {tokenSelectorHint && (
                    <div className="mt-2 text-center text-[11px] font-medium text-cyan-200 animate-pulse">
                      ↓ Choose one of your available tokens
                    </div>
                  )}

                  {selectedToken && (
                    <div className="mt-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.045] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_28px_rgba(0,0,0,0.18)]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                            Selected Asset
                          </p>

                          <p className="mt-1 truncate text-sm font-bold text-white">
                            {(selectedToken.symbol || selectedToken.mint.slice(0, 6)).toUpperCase()}
                            {selectedToken.name &&
                              selectedToken.name.toUpperCase() !==
                              (selectedToken.symbol || '').toUpperCase() && (
                                <span className="font-medium text-gray-300">
                                  {' '}— {selectedToken.name}
                                </span>
                              )}
                          </p>
                        </div>

                        <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-right">
                          <p className="text-[10px] text-gray-400">Balance</p>
                          <p className="text-sm font-bold text-cyan-100">
                            {formatTokenAmount(selectedToken)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!tokensLoading && tokens.length === 0 && (
                    <p className="text-xs text-gray-400 mb-2">
                      No supported tokens were found in this wallet yet.
                    </p>
                  )}

                  {tokensError && (
                    <p className="text-xs text-red-400 mb-2">
                      Could not fully sync wallet tokens. Please try again.
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="text-gray-400">Connect your wallet to see your tokens.</p>
          )}

          <div className="my-5 flex items-center justify-center gap-3 px-8" aria-hidden>
            <div className="h-[2px] w-full max-w-[220px] bg-gradient-to-r from-transparent via-cyan-400/24 to-cyan-400/10" />

            <div className="relative flex h-7 w-7 items-center justify-center">
              <span className="absolute h-7 w-7 rounded-full bg-cyan-400/10 blur-md" />
              <span className="relative text-[13px] text-cyan-200/85">↕</span>
            </div>

            <div className="h-[2px] w-full max-w-[220px] bg-gradient-to-l from-transparent via-cyan-400/24 to-cyan-400/10" />
          </div>

          <h2 className="text-lg text-left mb-2">You receive</h2>
          <p className="text-xs text-gray-400 text-left mb-2">
            $MEGY — the currency of the Fair Future Fund
          </p>

          <div className="mt-3">
            <div
              className="w-full bg-gray-800 rounded-full h-6 overflow-hidden relative border border-gray-600"
              aria-label="Your share of the Fair Future Fund"
            >
              <div
                className="h-6 bg-gradient-to-r from-yellow-800 via-green-500 to-yellow-300"
                style={{ width: `${sharePercentage}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs text-yellow-200 font-bold">
                {sharePercentage}%
              </span>
            </div>

            <p className="text-sm text-gray-300 mt-2 text-left">
              🌍 Your personal contribution to the Fair Future Fund (% of total)
            </p>
          </div>
          <div className="w-full max-w-5xl mt-6">
            <button
              type="button"
              onClick={() => {
                if (!connected || !pubkeyBase58) {
                  showCoinFlowOverlay(
                    'Wallet Required',
                    'Connect your wallet to view your Coincarnation profile.',
                    'info',
                    3200
                  );
                  return;
                }

                router.push('/profile');
              }}
              title={
                connected && pubkeyBase58
                  ? 'Open your Coincarnation profile'
                  : 'Connect wallet to open your profile'
              }
              aria-label={
                connected && pubkeyBase58
                  ? 'Open your Coincarnation profile'
                  : 'Connect wallet to open your profile'
              }
              className={[
                'group relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all duration-300',
                'bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_28px_rgba(0,0,0,0.18)]',
                connected && pubkeyBase58
                  ? 'border-cyan-400/18 hover:border-cyan-300/30 hover:bg-cyan-400/[0.055] hover:shadow-[0_14px_34px_rgba(0,0,0,0.24),0_0_24px_rgba(34,211,238,0.10)]'
                  : 'border-white/10 hover:border-cyan-400/22 hover:bg-white/[0.05]',
              ].join(' ')}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.07),transparent_30%)]" />

              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-sm',
                      connected && pubkeyBase58
                        ? 'border-cyan-300/20 bg-cyan-400/10 text-cyan-200'
                        : 'border-white/10 bg-white/[0.04] text-gray-400',
                    ].join(' ')}
                  >
                    {connected && pubkeyBase58 ? '⦿' : '◌'}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">
                      Open Your Profile
                    </p>

                    <p className="mt-0.5 truncate text-[11px] text-gray-400">
                      {connected && pubkeyBase58
                        ? 'claims · contributions · personal value currency'
                        : 'connect wallet required for personal access'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-cyan-200/80 transition-transform duration-300 group-hover:translate-x-0.5">
                  ↗
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Fair Future Engine */}
      <section className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.14),transparent_32%),linear-gradient(180deg,rgba(9,18,22,0.96),rgba(6,10,18,0.98))] p-4 sm:p-6 md:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.34),0_0_48px_rgba(16,185,129,0.08),0_0_54px_rgba(34,211,238,0.07)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_24%,rgba(34,211,238,0.08)_58%,transparent_82%)] opacity-70" />

        <div className="relative z-[1] grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.75)]" />
              Proof of Value Economy
            </div>

            <h2 className="mt-4 text-2xl font-black leading-tight text-white sm:text-3xl md:text-4xl">
              The Fair Future Engine
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300 sm:text-base sm:leading-7">
              Coincarnation unites the value that millions of people have lost — or are
              about to lose — across billions in crypto assets into one shared economic
              engine, built to form the Fair Future Fund.
            </p>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-sm leading-6 text-gray-300">
                The Fair Future Fund, formed through Coincarnation, is designed to generate
                global capital gains and return them to Coincarnators — with one mission:
                reducing personal wealth inequality worldwide.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.055] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                  Value Source
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Coincarnation
                </p>
              </div>

              <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.055] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">
                  Unit
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  CorePoint
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.055] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                  Outcome
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Personal Value Currency
                </p>
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[420px] py-4 sm:py-6">
            <div className="relative mx-auto flex min-h-[255px] items-center justify-center sm:min-h-[320px]">
              <div className="absolute h-[245px] w-[245px] rounded-full border border-emerald-300/10 sm:h-[340px] sm:w-[340px]" />
              <div className="absolute h-[195px] w-[195px] rounded-full border border-cyan-300/10 sm:h-[270px] sm:w-[270px]" />
              <div className="absolute h-[135px] w-[135px] rounded-full border border-violet-300/10 sm:h-[190px] sm:w-[190px]" />

              <div className="relative flex h-[165px] w-[165px] flex-col items-center justify-center rounded-full border border-emerald-300/25 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),rgba(8,18,20,0.96)_58%,rgba(5,10,16,0.98))] text-center shadow-[0_0_50px_rgba(16,185,129,0.16)] sm:h-[220px] sm:w-[220px]">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-200 sm:text-[10px] sm:tracking-[0.22em]">
                  Core Engine
                </p>
                <p className="mt-2 text-lg font-black text-white sm:text-2xl">
                  Fair Future Fund
                </p>
                <p className="mt-2 max-w-[130px] text-[10px] leading-4 text-gray-300 sm:max-w-[170px] sm:text-[11px] sm:leading-5">
                  collective revival power into shared future value
                </p>
              </div>

              <div className="absolute left-0 top-5 hidden rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] px-3 py-2 text-xs font-semibold text-cyan-100 shadow-[0_12px_30px_rgba(0,0,0,0.25)] sm:block">
                Coincarne Actions
              </div>

              <div className="absolute right-0 top-10 hidden rounded-2xl border border-amber-300/20 bg-amber-400/[0.08] px-3 py-2 text-xs font-semibold text-amber-100 shadow-[0_12px_30px_rgba(0,0,0,0.25)] sm:block">
                Deadcoin Deliveries
              </div>

              <div className="absolute bottom-8 left-2 hidden rounded-2xl border border-violet-300/20 bg-violet-400/[0.08] px-3 py-2 text-xs font-semibold text-violet-100 shadow-[0_12px_30px_rgba(0,0,0,0.25)] sm:block">
                Referrals
              </div>

              <div className="absolute bottom-3 right-2 hidden rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.08] px-3 py-2 text-xs font-semibold text-emerald-100 shadow-[0_12px_30px_rgba(0,0,0,0.25)] sm:block">
                Social Impact
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] px-3 py-2 text-center text-[11px] font-semibold text-cyan-100">
                Coincarne Actions
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.08] px-3 py-2 text-center text-[11px] font-semibold text-amber-100">
                Deadcoin Deliveries
              </div>

              <div className="rounded-2xl border border-violet-300/20 bg-violet-400/[0.08] px-3 py-2 text-center text-[11px] font-semibold text-violet-100">
                Referrals
              </div>

              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.08] px-3 py-2 text-center text-[11px] font-semibold text-emerald-100">
                Social Impact
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-[1] mt-6 rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <div className="inline-flex items-center justify-center sm:justify-start gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.7)]" />
              Fair Future Principle
            </div>

            <p className="text-sm font-semibold leading-6 text-white sm:text-base">
              Every human being should have the right to build a personal currency powered
              by the value they contribute to the world.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200 sm:justify-start sm:text-[11px]">
              <span>Proof of Value</span>
              <span className="text-gray-500">→</span>
              <span>CorePoint</span>
              <span className="text-gray-500">→</span>
              <span>Personal Value Currency</span>
              <span className="text-gray-500">→</span>
              <span>Fair Future Fund</span>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold text-white">
              Recently Coincarnated
            </h2>
            <div className="mt-1 max-w-2xl">
              <p className="text-xs text-green-400">
                🔥 {liveActivity.length} tokens • {totalClusteredCoincarnations} Coincarnations
                <span className="text-emerald-400 ml-1">
                  ({recentActivityCount} active in last 10 min)
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-400">
                A live view of how damaged tokens are being processed through Coincarnation.
              </p>
            </div>
          </div>

          <a
            href="/coinographia"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-gradient-to-r from-slate-800/90 via-indigo-900/70 to-slate-800/90 px-4 py-2 text-sm font-medium text-white shadow-[0_0_20px_rgba(34,211,238,0.08)] transition-all duration-200 hover:border-cyan-300/30 hover:from-slate-700/90 hover:via-indigo-800/80 hover:to-slate-700/90 hover:shadow-[0_0_28px_rgba(34,211,238,0.14)]"
          >
            <span>Explore Coinographia</span>
            <span aria-hidden>↗</span>
          </a>
        </div>

        {liveActivityError && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {liveActivityError}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 justify-items-center md:grid-cols-2 xl:grid-cols-3">
          {liveActivityLoading && liveActivity.length === 0 ? (
            [...Array(getActivityDisplayLimit())].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/10" />
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-28 rounded bg-white/10" />
                    <div className="mt-2 h-3 w-20 rounded bg-white/10" />
                  </div>
                </div>
                <div className="mt-4 h-3 w-3/4 rounded bg-white/10" />
                <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
              </div>
            ))
          ) : liveActivity.length > 0 ? (
            liveActivity.map((item, index) => {
              const title =
                item.tokenSymbol
                  ? `$${item.tokenSymbol}${item.tokenName ? ` — ${item.tokenName}` : ''}`
                  : item.tokenName || item.shortMint;

              return (
                <article
                  key={`${item.tokenContract}-${item.timestamp}-${index}`}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push('/coinographia')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push('/coinographia');
                    }
                  }}
                  style={{ animationDelay: `${index * 60}ms` }}
                  className={[
                    'animate-[fadeIn_0.4s_ease-out_both] relative block w-full max-w-[380px] cursor-pointer rounded-2xl border bg-white/[0.03] p-3 sm:p-4 transition-all duration-200 hover:bg-white/[0.06] hover:scale-[1.02] hover:-translate-y-1 hover:shadow-[0_0_40px_rgba(16,185,129,0.25)] focus:outline-none focus:ring-2 focus:ring-emerald-400/40',
                    index === 0
                      ? 'border-emerald-400/40 shadow-[0_0_30px_rgba(16,185,129,0.18)] bg-emerald-500/[0.03]'
                      : index === 1 || index === 2
                        ? 'border-emerald-400/20 hover:border-emerald-300/30'
                        : index === 3 || index === 4
                          ? 'border-cyan-400/20 hover:border-cyan-300/30'
                          : index === 5 || index === 6
                            ? 'border-blue-400/20 hover:border-blue-300/30'
                            : 'border-amber-400/20 hover:border-amber-300/30',
                  ].join(' ') + ' ' + getClusterGlowClass(item, activityNow)}
                >
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div className="absolute top-3 right-3 z-10 hidden sm:flex flex-col gap-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canCoincarnateStatus(item.status)) return;
                          startCoincarnateFlow(item.tokenContract, item.tokenSymbol, item.tokenName);
                        }}
                        disabled={!canCoincarnateStatus(item.status)}
                        className={
                          canCoincarnateStatus(item.status)
                            ? "flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/[0.07] text-[20px] leading-none text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_18px_rgba(0,0,0,0.20)] transition-all duration-200 hover:scale-110 hover:border-violet-300/40 hover:bg-violet-500/14 hover:text-white active:scale-95"
                            : `${getCoincarnateDisabledClass()} h-8 w-8 text-[20px] leading-none`
                        }
                        title={
                          canCoincarnateStatus(item.status)
                            ? 'Coincarnate this token'
                            : 'Coincarnation is disabled for redlisted or blacklisted tokens'
                        }
                        aria-label={canCoincarnateStatus(item.status) ? 'Coincarnate this token' : 'Coincarnation disabled'}
                      >
                        <span className="leading-none text-[16px]">✦</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canShareStatus(item.status)) return;
                          void shareClusterOnX(item);
                        }}
                        disabled={!canShareStatus(item.status)}
                        className={
                          canShareStatus(item.status)
                            ? `${getShareButtonClass(getHeatLevel(item, activityNow))} h-8 w-8 text-[20px] leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_18px_rgba(0,0,0,0.20)] hover:scale-110 active:scale-95`
                            : `${getShareButtonDisabledClass()} h-8 w-8 text-[20px] leading-none`
                        }
                        title={
                          canShareStatus(item.status)
                            ? 'Share signal'
                            : 'Sharing is disabled for redlisted or blacklisted tokens'
                        }
                        aria-label={canShareStatus(item.status) ? 'Share signal' : 'Sharing disabled'}
                      >
                        <ShareArrowIcon className="h-[15px] w-[15px]" />
                      </button>
                    </div>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!canCoincarnateStatus(item.status)) return;
                        startCoincarnateFlow(item.tokenContract, item.tokenSymbol, item.tokenName);
                      }}
                      disabled={!canCoincarnateStatus(item.status)}
                      className={
                        canCoincarnateStatus(item.status)
                          ? "absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/[0.07] text-[18px] leading-none text-violet-100 transition-all duration-200 hover:bg-violet-500/14 active:scale-95 sm:hidden"
                          : `${getCoincarnateDisabledClass()} absolute top-3 right-3 z-10 h-8 w-8 text-[18px] leading-none sm:hidden`
                      }
                      title={
                        canCoincarnateStatus(item.status)
                          ? 'Coincarnate this token'
                          : 'Coincarnation is disabled for redlisted or blacklisted tokens'
                      }
                      aria-label={
                        canCoincarnateStatus(item.status)
                          ? 'Coincarnate this token'
                          : 'Coincarnation disabled'
                      }
                    >
                      <span className="leading-none text-[15px]">✦</span>
                    </button>

                    {isUltraFresh(item.timestamp, activityNow) && (
                      <span className="pointer-events-none absolute inset-0 rounded-2xl animate-pulse border border-emerald-400/40" />
                    )}

                    <div className="flex shrink-0 flex-col items-center gap-2 pt-0.5">
                      {item.logoURI ? (
                        <img
                          src={item.logoURI}
                          alt={title}
                          className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border border-white/10 bg-white/5" />
                      )}

                      {(() => {
                        const heatLevel = getHeatLevel(item, activityNow);

                        return (
                          <span className={getHeatBadgeClass(heatLevel)}>
                            {getHeatLabel(heatLevel)}
                          </span>
                        );
                      })()}

                      {item.occurrenceCount > 1 && (
                        <span
                          className={getClusterBadgeClass(item.occurrenceCount)}
                          title={`${item.occurrenceCount} Coincarnations in recent activity`}
                        >
                          x{item.occurrenceCount}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate max-w-full pr-14 text-[14px] sm:text-[15px] font-semibold leading-5 text-white">
                        {title}
                      </div>

                      <div className="mt-0.5 truncate pr-14 text-[11px] sm:text-[12px] text-gray-400">
                        {item.shortMint}
                      </div>

                      <div className="mt-2.5 flex items-center gap-2 text-[11px] sm:text-xs">
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 sm:px-2.5 sm:py-1 text-emerald-200 whitespace-nowrap">
                          Coincarnated
                        </span>

                        {item.status && (
                          <span className={getStatusBadgeClass(item.status)}>
                            {formatStatusLabel(item.status)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2.5 min-w-0 text-[11px] sm:text-xs text-gray-400">
                        <div className="hidden sm:block truncate whitespace-nowrap pr-14">
                          By: <span className="font-mono text-gray-300">{shortenWalletCompact(item.shortWallet)}</span>
                          <span className="mx-1 text-gray-600">•</span>
                          <span className="text-white font-medium">${item.totalUsdValue.toFixed(2)}</span>
                        </div>

                        <div className="block sm:hidden truncate whitespace-nowrap pr-12">
                          By: <span className="font-mono text-gray-300">{shortenWalletCompact(item.shortWallet)}</span>
                          <span className="mx-1 text-gray-600">•</span>
                          <span className="text-white font-medium">${item.totalUsdValue.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] sm:text-xs">
                        <div className="min-w-0 pr-12 sm:pr-0 text-gray-400">
                          <span>
                            {item.uniqueWalletCount} wallet{item.uniqueWalletCount === 1 ? '' : 's'}
                          </span>

                          <span className="inline sm:hidden mx-1 text-gray-600">•</span>

                          <span className="inline sm:hidden whitespace-nowrap text-gray-500 font-medium">
                            {formatRelativeTimeEnhanced(item.timestamp, activityNow)}
                          </span>
                        </div>

                        <div className="hidden sm:block shrink-0 whitespace-nowrap text-gray-500 font-medium">
                          {formatRelativeTimeEnhanced(item.timestamp, activityNow)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canShareStatus(item.status)) return;
                          void shareClusterOnX(item);
                        }}
                        disabled={!canShareStatus(item.status)}
                        className={
                          canShareStatus(item.status)
                            ? `${getShareButtonClass(getHeatLevel(item, activityNow))} absolute right-3 bottom-3 z-10 h-8 w-8 sm:hidden`
                            : `${getShareButtonDisabledClass()} absolute right-3 bottom-3 z-10 h-8 w-8 sm:hidden`
                        }
                        title={
                          canShareStatus(item.status)
                            ? 'Share signal'
                            : 'Sharing is disabled for redlisted or blacklisted tokens'
                        }
                        aria-label={canShareStatus(item.status) ? 'Share signal' : 'Sharing disabled'}
                      >
                        <ShareArrowIcon className="h-[15px] w-[15px]" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
              No Coincarnation activity has been recorded yet.
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-col items-center justify-center gap-2 text-center text-xs text-gray-500 sm:flex-row sm:gap-2">

          <a
            href="/coinographia"
            className="group max-w-[260px] sm:max-w-none cursor-pointer transition-all duration-200 hover:text-emerald-300 hover:underline underline-offset-4 decoration-emerald-400/40"
          >
            Only a fraction of the latest Coincarnations is shown here
          </a>

          <span className="flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70 animate-pulse group-hover:bg-emerald-300" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60 animate-pulse [animation-delay:150ms] group-hover:bg-emerald-300" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/50 animate-pulse [animation-delay:300ms] group-hover:bg-emerald-300" />
          </span>

        </div>
      </div>

      {/* Protocol Pulse Metrics */}
      <section className="w-full max-w-5xl">
        <div className="relative overflow-hidden rounded-[32px] border border-cyan-400/15 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,rgba(4,11,20,0.92),rgba(2,6,14,0.98))] px-4 py-7 sm:px-6 sm:py-9 shadow-[0_28px_90px_rgba(0,0,0,0.38),0_0_60px_rgba(34,211,238,0.08)]">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/10" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/10" />

          <div className="relative z-[1] text-center">
            <div className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.75)]" />
              Protocol Pulse
            </div>

            <h2 className="mt-4 text-2xl font-black leading-tight text-white sm:text-3xl">
              Global Revival Metrics
            </h2>

            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              The live output of Coincarnation: revived value, active wallets,
              processed deadcoins, and emerging Proof of Value units.
            </p>
          </div>

          <div className="relative z-[1] mx-auto mt-7 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-[1fr_1.35fr_1fr] md:items-center">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.045] p-4 text-center md:text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                  Participants
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  <CountUp end={globalStats.totalParticipants} duration={2} />
                </p>
                <p className="mt-1 text-[11px] leading-4 text-gray-400">
                  unique wallets
                </p>
              </div>

              <div className="rounded-2xl border border-amber-300/15 bg-amber-400/[0.045] p-4 text-center md:text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
                  Deadcoins
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  <CountUp end={globalStats.uniqueDeadcoins} duration={2} />
                </p>
                <p className="mt-1 text-[11px] leading-4 text-gray-400">
                  processed
                </p>
              </div>
            </div>

            <div className="relative mx-auto flex min-h-[230px] w-full max-w-[360px] items-center justify-center rounded-[32px] border border-emerald-300/18 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18),transparent_54%),rgba(255,255,255,0.035)] p-5 text-center shadow-[0_0_45px_rgba(16,185,129,0.12)] sm:min-h-[270px]">
              <div className="pointer-events-none absolute inset-4 rounded-[28px] border border-white/8" />
              <div className="pointer-events-none absolute inset-8 rounded-full border border-emerald-300/10" />

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">
                  Total USD Revived
                </p>

                <p className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
                  $<CountUp end={globalStats.totalUsd} decimals={2} duration={2} />
                </p>

                <p className="mx-auto mt-3 max-w-[230px] text-xs leading-5 text-gray-400">
                  capital redirected into the Fair Future Fund
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.045] p-4 text-center md:text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">
                  CorePoint
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  <CountUp end={generatedCorePoint} duration={2} />
                </p>
                <p className="mt-1 text-[11px] leading-4 text-gray-400">
                  generated units
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.045] p-4 text-center md:text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                  Value Engine
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  Live
                </p>
                <p className="mt-1 text-[11px] leading-4 text-gray-400">
                  Proof of Value active
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full max-w-5xl mt-2 text-center">
        <a
          href="/docs"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
        >
          <span>📘</span>
          <span>Read the Docs</span>
        </a>
      </div>

      <AdminLink className="w-full max-w-5xl mt-3" />

      {/* Modal */}
      {showSolModal && selectedToken && chain === 'solana' && (
        <CoincarneModal
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null);
            setShowSolModal(false);
          }}
          refetchTokens={refetchTokens}
          onGoToProfileRequest={() => router.push('/profile')}
        />
      )}
    </div>
  );
}
