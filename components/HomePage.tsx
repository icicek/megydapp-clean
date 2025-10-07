// components/HomePage.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import CountUp from 'react-countup';

import CoincarneModal from '@/components/CoincarneModal';
import TrustPledge from '@/components/TrustPledge';
import Skeleton from '@/components/ui/Skeleton';
import ConnectBar from '@/components/wallet/ConnectBar';

import { useWalletTokens, TokenInfo } from '@/hooks/useWalletTokens';
import { useChain } from '@/app/providers/ChainProvider';

// 🔽 Tek-kaynak token meta çözümleyici
import { getTokenMeta } from '@/lib/solana/tokenMeta';

export default function HomePage() {
  const router = useRouter();
  const { chain } = useChain(); // Şu an 'solana'
  const { publicKey, connected } = useWallet();
  const pubkeyBase58 = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);

  // -------- SOLANA TOKENLERİ --------
  const {
    tokens,
    loading: tokensLoading,
    refreshing,
    error: tokensError,
    refetchTokens,
  } = useWalletTokens({
    autoRefetchOnFocus: true,
    autoRefetchOnAccountChange: true,
    pollMs: 20000,
  });

  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showSolModal, setShowSolModal] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mint = e.target.value;
    const token = tokens.find((t) => t.mint === mint) || null;
    setSelectedToken(token);
    setShowSolModal(Boolean(token));
  };

  // 🔽 Cihazdan bağımsız, tutarlı semboller için meta çözümleri
  const [resolvedMeta, setResolvedMeta] = useState<
    Record<string, { symbol: string; name?: string; logoURI?: string; verified?: boolean }>
  >({});

  useEffect(() => {
    if (!tokens.length) {
      setResolvedMeta({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        tokens.map(async (t) => {
          const meta = await getTokenMeta(t.mint, t.symbol); // EN-US fallback içerir
          return [t.mint, { symbol: meta.symbol, name: meta.name, logoURI: meta.logoURI, verified: meta.verified }] as const;
        })
      );
      if (!cancelled) setResolvedMeta(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [tokens]);

  /** ---------------- GLOBAL STATS ---------------- */
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

  /** ---------------- UI DERIVED ---------------- */
  const shareRatio = globalStats.totalUsd > 0 ? userContribution / globalStats.totalUsd : 0;
  const sharePercentage = Math.max(0, Math.min(100, shareRatio * 100)).toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white flex flex-col items-center px-6 pt-4 pb-6 space-y-8">
      {/* ÜST BAR (yalnız Solana, masaüstü) */}
      <div className="w-full hidden md:flex justify-end mt-2 mb-2 gap-3">
        <ConnectBar />
      </div>

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

        {/* 🔽 Mobilde başlıkların ALTINDA Connect — masaüstünde gizli */}
        <div className="md:hidden mt-4 flex justify-center">
          <div className="w-full max-w-xs">
            <ConnectBar />
          </div>
        </div>
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
                    const meta = resolvedMeta[token.mint];
                    const label =
                      meta?.symbol ||
                      token.symbol ||
                      token.mint.slice(0, 4).toLocaleUpperCase('en-US'); // locale-safe fallback
                    return (
                      <option key={token.mint} value={token.mint}>
                        {label} — {token.amount.toFixed(4)}
                      </option>
                    );
                  })}
                </select>

                {!tokensLoading && tokens.length === 0 && tokensError && (
                  <p className="text-xs text-red-400 mb-2">
                    Token fetch error: {String(tokensError)}
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

      <div className="w-full max-w-5xl">
        <TrustPledge compact />
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
