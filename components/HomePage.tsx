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
  const [liveActivity, setLiveActivity] = useState<LiveActivityItem[]>([]);
  const [liveActivityLoading, setLiveActivityLoading] = useState(false);
  const [liveActivityError, setLiveActivityError] = useState<string | null>(null);
  const [liveActivityTotal, setLiveActivityTotal] = useState(0);

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

  function formatRelativeTimeEnhanced(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Recently';
  
    const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  
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

  function getActivityDisplayLimit() {
    if (typeof window === 'undefined') return 8;
  
    const w = window.innerWidth;
  
    if (w >= 1200) return 9; // 3-column desktop
    if (w >= 768) return 8;  // 2-column layout
    return 8;                // mobile
  }
  
  function getActivityFetchLimit() {
    const displayLimit = getActivityDisplayLimit();
    return Math.max(displayLimit * 3, 24);
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

  useEffect(() => {
    const ac = new AbortController();
  
    (async () => {
      try {
        setLiveActivityLoading(true);
        setLiveActivityError(null);
  
        const displayLimit = getActivityDisplayLimit();
        const fetchLimit = getActivityFetchLimit();
  
        const res = await fetch(`/api/live-activity?limit=${fetchLimit}`, {
          cache: 'no-store',
          signal: ac.signal,
        });
  
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
  
        const data = await res.json();
        const incoming = Array.isArray(data?.items) ? data.items : [];
        setLiveActivityTotal(Number(data?.total || 0));
  
        const uniqueLimited: LiveActivityItem[] = [];
        const seen = new Map<string, number>();
  
        for (const item of incoming) {
          const count = seen.get(item.tokenContract) || 0;
  
          if (count < 2) {
            uniqueLimited.push(item);
            seen.set(item.tokenContract, count + 1);
          }
  
          if (uniqueLimited.length >= displayLimit) break;
        }
  
        setLiveActivity(uniqueLimited);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setLiveActivityError(e?.message || 'Could not load live activity.');
      } finally {
        setLiveActivityLoading(false);
      }
    })();
  
    return () => ac.abort();
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
                🔥 {liveActivity.length}/{liveActivityTotal} Coincarnations recently triggered
              </p>
              <p className="mt-1 text-sm text-gray-400">
                A live glimpse into the latest Coincarnation activity across the ecosystem.
              </p>
            </div>
          </div>

          <a
            href="/token-universe"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]"
          >
            <span className="sm:hidden">↗</span>
            <span>Explore Coinographia</span>
            <span className="hidden sm:inline">↗</span>
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
                <a
                  key={`${item.tokenContract}-${item.timestamp}-${index}`}
                  href="/token-universe"
                  className={[
                    'relative block w-full max-w-[380px] rounded-2xl border bg-white/[0.03] p-4 transition-all duration-200 hover:bg-white/[0.06] hover:scale-[1.02] hover:-translate-y-1',
                    index === 0
                      ? 'border-emerald-400/30 shadow-[0_0_24px_rgba(16,185,129,0.12)]'
                      : index < 3
                      ? 'border-white/15'
                      : 'border-white/10',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        sessionStorage.setItem('coincarnate_target_mint', item.tokenContract);
                        window.location.href = '/';
                      }}
                      className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 transition"
                      title="Coincarnate this token"
                    >
                      ↗
                    </button>
                    {index === 0 && (
                      <span className="absolute left-4 bottom-4 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200">
                        Live
                      </span>
                    )}
                    {item.logoURI ? (
                      <img
                        src={item.logoURI}
                        alt={title}
                        className="h-12 w-12 rounded-full border border-white/10 object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full border border-white/10 bg-white/5 shrink-0" />
                    )}

                    <div className="min-w-0 flex-1 pr-14 pb-6">
                      <div className="truncate text-[15px] font-semibold leading-5 text-white max-w-full">
                        {title}
                      </div>

                      <div className="mt-1 truncate text-[12px] text-gray-400">
                        {item.shortMint}
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-200 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                          Coincarnated
                        </span>

                        <span className="text-gray-400 font-medium whitespace-nowrap">
                          {formatRelativeTimeEnhanced(item.timestamp)}
                        </span>
                      </div>

                      <div className="mt-3 text-xs text-gray-400 truncate whitespace-nowrap">
                        Coincarnator: <span className="font-mono text-gray-300">{item.shortWallet}</span>
                      </div>

                      <div className="mt-1 text-xs text-gray-400">
                        Value: <span className="text-white font-medium">${item.usdValue.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })
          ) : (
            <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
              No Coincarnation activity has been recorded yet.
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
          <span>Only a fraction of live Coincarnations is shown here</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60 animate-pulse [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/50 animate-pulse [animation-delay:300ms]" />
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
