// components/HomePage.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
const ACTIVITY_HOT_WINDOW_MS = 5 * 60 * 1000;
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

  function safeReadPendingCoincarnateMint(): string | null {
    if (typeof window === 'undefined') return null;
  
    try {
      const mint = sessionStorage.getItem('coincarnate_target_mint');
      return mint && mint.trim() ? mint.trim() : null;
    } catch {
      return null;
    }
  }
  
  function clearPendingCoincarnateMint() {
    if (typeof window === 'undefined') return;
  
    try {
      sessionStorage.removeItem('coincarnate_target_mint');
    } catch {}
  }

  function startCoincarnateFlow(mint: string) {
    if (typeof window === 'undefined') return;
  
    try {
      sessionStorage.setItem('coincarnate_target_mint', mint);
    } catch {}
  
    window.location.href = '/';
  }

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mint = e.target.value;
  
    const token = tokens.find((t) => t.mint === mint) || null;
  
    if (!token) {
      setSelectedToken(null);
      setShowSolModal(false);
      return;
    }
  
    const hasValidAmount =
      (typeof token.amount === 'number' && Number.isFinite(token.amount)) ||
      (typeof token.uiAmountString === 'string' && token.uiAmountString.trim().length > 0);
  
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
      } catch {}
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
      } catch {}
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
    if (typeof window === 'undefined') return;
    if (tokensLoading) return;
    if (!tokens || tokens.length === 0) return;
  
    const pendingMint = safeReadPendingCoincarnateMint();
    if (!pendingMint) return;
  
    if (autoOpenHandledMint === pendingMint) return;
  
    const matchedToken = tokens.find(
      (t) => String(t.mint).toLowerCase() === pendingMint.toLowerCase()
    );
  
    if (!matchedToken) {
      // Token was requested from Coinographia, but it is not currently present
      // in the connected wallet token list. Clear the pending state to avoid loops.
      clearPendingCoincarnateMint();
      setAutoOpenHandledMint(pendingMint);
      return;
    }
  
    const hasValidAmount =
      (typeof matchedToken.amount === 'number' && Number.isFinite(matchedToken.amount)) ||
      (typeof matchedToken.uiAmountString === 'string' && matchedToken.uiAmountString.trim().length > 0);
  
    if (!hasValidAmount) {
      clearPendingCoincarnateMint();
      setAutoOpenHandledMint(pendingMint);
      return;
    }
  
    setSelectedToken(matchedToken);
    setShowSolModal(true);
    clearPendingCoincarnateMint();
    setAutoOpenHandledMint(pendingMint);
  }, [tokens, tokensLoading, autoOpenHandledMint]);

  const shareRatio = globalStats.totalUsd > 0 ? userContribution / globalStats.totalUsd : 0;
  const sharePercentage = Math.max(0, Math.min(100, shareRatio * 100)).toFixed(2);

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

      <div className="w-full max-w-5xl bg-gradient-to-br from-gray-900 via-zinc-800 to-gray-900 p-8 rounded-2xl border border-purple-700 shadow-2xl">
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

                <select
                  id="token-select"
                  className="w-full bg-gray-800 text-white p-3 rounded mb-2 border border-gray-600"
                  value={selectedToken?.mint || ''}
                  onChange={handleSelectChange}
                >
                  <option value="" disabled>
                    👉 Select a token to Coincarnate
                  </option>
                  {tokens.map((token) => {
                    const sym = (token.symbol ?? token.mint.slice(0, 6)).toUpperCase();
                    const name = token.name?.trim();
                    const amt = formatTokenAmount(token);

                    const label = name && name.toUpperCase() !== sym
                      ? `${sym} — ${name} — ${amt}`
                      : `${sym} — ${amt}`;

                    return (
                      <option key={token.mint} value={token.mint}>
                        {label}
                      </option>
                    );
                  })}
                </select>

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

        <div className="text-2xl my-4 text-center" aria-hidden>
          ↔️
        </div>

        <h2 className="text-lg text-left mb-2">You receive</h2>
        <p className="text-xs text-gray-400 text-left mb-2">
          $MEGY — the currency of the Fair Future Fund
        </p>

        <div className="mt-4">
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
      </div>

      <h2 className="text-xl md:text-2xl font-semibold text-white mb-4 text-center">
        🌐 Global Coincarnation Statistics
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 my-6 w-full max-w-5xl">
        <div className="rounded-xl p-[2px] bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600">
          <div className="bg-black/85 backdrop-blur-md rounded-xl p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Total Participants</p>
            <p className="text-lg font-bold text-white">
              <CountUp end={globalStats.totalParticipants} duration={2} />
            </p>
          </div>
        </div>

        <div className="rounded-xl p-[2px] bg-gradient-to-br from-green-400 via-green-500 to-green-600">
          <div className="bg-black/85 backdrop-blur-md rounded-xl p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Total USD Revived</p>
            <p className="text-lg font-bold text-white">
              $<CountUp end={globalStats.totalUsd} decimals={2} duration={2} />
            </p>
          </div>
        </div>

        <div className="rounded-xl p-[2px] bg-gradient-to-br from-pink-400 via-pink-500 to-pink-600">
          <div className="bg-black/85 backdrop-blur-md rounded-xl p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Unique Deadcoins</p>
            <p className="text-lg font-bold text-white">
              <CountUp end={globalStats.uniqueDeadcoins} duration={2} />
            </p>
          </div>
        </div>

        <div className="rounded-xl p-[2px] bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600">
          <div className="bg-black/85 backdrop-blur-md rounded-xl p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Most Popular Deadcoin</p>
            <p className="text-lg font-bold text-white">
              {globalStats.mostPopularDeadcoin || 'No deadcoin yet'}
            </p>
          </div>
        </div>
      </div>

      {publicKey && (
        <div className="w-full max-w-5xl flex justify-center">
          <button
            onClick={() => router.push('/profile')}
            className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-emerald-400 hover:to-cyan-400
                       text-white font-semibold py-3 px-6 rounded-xl shadow-green-500/50
                       hover:scale-110 hover:-translate-y-1 transition-all duration-300 flex items-center gap-2 mt-2"
          >
            <span>🧾</span>
            <span>Go to Profile</span>
          </button>
        </div>
      )}

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
                A live glimpse into the latest Coincarnation activity across the ecosystem.
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
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startCoincarnateFlow(item.tokenContract);
                      }}
                      className="absolute top-3 right-3 z-10 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                      title="Coincarnate this token"
                    >
                      ↗
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

                      <div className="mt-2.5 truncate whitespace-nowrap text-[11px] sm:text-xs text-gray-400">
                        Coincarnator: <span className="font-mono text-gray-300">{item.shortWallet}</span>
                      </div>

                      <div className="mt-1 text-[11px] sm:text-xs text-gray-400">
                        {item.uniqueWalletCount} wallet{item.uniqueWalletCount === 1 ? '' : 's'} joined
                      </div>

                      <div className="mt-1 flex items-end justify-between gap-3">
                        <div className="text-[11px] sm:text-xs text-gray-400">
                          Value: <span className="font-medium text-white">${item.totalUsdValue.toFixed(2)}</span>
                        </div>

                        <div className="shrink-0 text-[11px] sm:text-xs text-gray-500 font-medium text-right whitespace-nowrap">
                          {formatRelativeTimeEnhanced(item.timestamp, activityNow)}
                        </div>
                      </div>
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
