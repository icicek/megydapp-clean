// components/HomePage.tsx
"use client";

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import CoincarneModal from '@/components/CoincarneModal';
import CountUp from 'react-countup';
import ConnectWalletCTA from '@/components/wallet/ConnectWalletCTA';
import TrustPledge from '@/components/TrustPledge';

// ✅ New hook
import { useWalletTokens, TokenInfo } from '@/hooks/useWalletTokens';
// ✅ Skeleton
import Skeleton from '@/components/ui/Skeleton';

export default function HomePage() {
  const { publicKey, connected } = useWallet();

  // ---------- Admin session/wallet checks ----------
  const [isAdminWallet, setIsAdminWallet] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
        if (!aborted) setIsAdminSession(res.ok);
      } catch {
        if (!aborted) setIsAdminSession(false);
      }
    })();
    return () => { aborted = true; };
  }, [publicKey, connected]);

  useEffect(() => {
    const recheck = async () => {
      try {
        const res = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
        setIsAdminSession(res.ok);
      } catch {
        setIsAdminSession(false);
      }
    };
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, []);

  useEffect(() => {
    let aborted = false;
    (async () => {
      if (!connected || !publicKey) {
        if (!aborted) setIsAdminWallet(false);
        return;
      }
      try {
        const w = publicKey.toBase58();
        const res = await fetch(`/api/admin/is-allowed?wallet=${w}`, { cache: 'no-store' });
        const j = await res.json().catch(() => null);
        if (!aborted) setIsAdminWallet(Boolean(j?.allowed));
      } catch {
        if (!aborted) setIsAdminWallet(false);
      }
    })();
    return () => { aborted = true; };
  }, [publicKey, connected]);

  // ---------- Tokens via hook ----------
  const {
    tokens,
    loading: tokensLoading,
    error: tokensError,
    refetchTokens,
  } = useWalletTokens({
    autoRefetchOnFocus: true,
    autoRefetchOnAccountChange: true,
    pollMs: 20000,
  });

  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showModal, setShowModal] = useState(false);

  // ---------- Global & user stats ----------
  const [globalStats, setGlobalStats] = useState({
    totalUsd: 0,
    totalParticipants: 0,
    uniqueDeadcoins: 0,
    mostPopularDeadcoin: '',
  });

  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        const res = await fetch('/api/coincarnation/stats', { cache: 'no-store' });
        const data = await res.json();
        if (data.success) setGlobalStats(data);
      } catch (err) {
        console.error('Failed to fetch global stats:', err);
      }
    };
    fetchGlobalStats();
  }, []);

  const [userContribution, setUserContribution] = useState(0);

  useEffect(() => {
    if (!publicKey || !connected) return;

    const fetchStats = async () => {
      try {
        const [globalRes, userRes] = await Promise.all([
          fetch('/api/coincarnation/stats', { cache: 'no-store' }),
          fetch(`/api/claim/${publicKey.toBase58()}`, { cache: 'no-store' }),
        ]);
        const globalData = await globalRes.json();
        const userData = await userRes.json();

        if (globalData.success) setGlobalStats(globalData);
        if (userData.success) setUserContribution(userData.data.total_usd_contributed);
      } catch (err) {
        console.error('❌ Failed to fetch stats or user data:', err);
      }
    };

    fetchStats();
  }, [publicKey, connected]);

  // ---------- UI handlers ----------
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mint = e.target.value;
    const token = tokens.find(t => t.mint === mint);
    if (token) {
      setSelectedToken(token);
      setShowModal(true);
    }
  };

  const shareRatio = globalStats.totalUsd > 0 ? userContribution / globalStats.totalUsd : 0;
  const sharePercentageNum = Math.max(0, Math.min(100, shareRatio * 100));
  const sharePercentage = sharePercentageNum.toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white flex flex-col items-center p-6 space-y-8">

      <div className="w-full hidden md:flex justify-end mt-2 mb-4">
        <ConnectWalletCTA />
      </div>

      <section className="text-center py-4 w-full">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-2">Turn Deadcoins into a Fair Future.</h1>
        <p className="text-lg md:text-xl text-pink-400 mb-1">This is not a swap. This is reincarnation.</p>
        <p className="text-sm text-gray-300 max-w-xl mx-auto">Burning wealth inequality. One deadcoin at a time.</p>
      </section>

      <div className="w-full flex md:hidden justify-center my-5">
        <div className="w-full max-w-xs">
          <ConnectWalletCTA />
        </div>
      </div>

      <div className="w-full max-w-5xl bg-gradient-to-br from-gray-900 via-zinc-800 to-gray-900 p-8 rounded-2xl border border-purple-700 shadow-2xl">
        <h2 className="text-lg mb-1 text-left">You give</h2>
        <p className="text-xs text-gray-400 text-left mb-2">Walking deadcoins, memecoins, any unsupported assets…</p>

        {publicKey ? (
          <>
            {/* Loading skeleton */}
            {tokensLoading && tokens.length === 0 ? (
              <div className="space-y-2 mb-4" data-testid="tokens-skeleton">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <select
                  className="w-full bg-gray-800 text-white p-3 rounded mb-2 border border-gray-600"
                  value={selectedToken?.mint || ''}
                  onChange={handleSelectChange}
                >
                  <option value="" disabled>
                    👉 {tokensLoading ? 'Loading tokens…' : 'Select a token to Coincarnate'}
                  </option>
                  {tokens.map((token, idx) => (
                    <option key={idx} value={token.mint}>
                      {token.symbol ?? token.mint.slice(0, 4)} — {token.amount.toFixed(4)}
                    </option>
                  ))}
                </select>
                {tokensError && (
                  <p className="text-xs text-red-400 mb-2">
                    Token fetch error: {tokensError}
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <p className="text-gray-400">Connect your wallet to see your tokens.</p>
        )}

        <div className="text-2xl my-4 text-center">↔️</div>

        <h2 className="text-lg text-left mb-2">You receive</h2>
        <p className="text-xs text-gray-400 text-left mb-2">$MEGY — the currency of the Fair Future Fund</p>

        <div className="mt-4">
          <div className="w-full bg-gray-800 rounded-full h-6 overflow-hidden relative border border-gray-600">
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
        {/* Total Participants */}
        <div className="rounded-xl p-[2px] bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600">
          <div className="bg-black/85 backdrop-blur-md rounded-xl p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Total Participants</p>
            <p className="text-lg font-bold text-white">
              <CountUp end={globalStats.totalParticipants} duration={2} />
            </p>
          </div>
        </div>

        {/* Total USD Revived */}
        <div className="rounded-xl p-[2px] bg-gradient-to-br from-green-400 via-green-500 to-green-600">
          <div className="bg-black/85 backdrop-blur-md rounded-xl p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Total USD Revived</p>
            <p className="text-lg font-bold text-white">
              $
              <CountUp end={globalStats.totalUsd} decimals={2} duration={2} />
            </p>
          </div>
        </div>

        {/* Unique Deadcoins */}
        <div className="rounded-xl p-[2px] bg-gradient-to-br from-pink-400 via-pink-500 to-pink-600">
          <div className="bg-black/85 backdrop-blur-md rounded-xl p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Unique Deadcoins</p>
            <p className="text-lg font-bold text-white">
              <CountUp end={globalStats.uniqueDeadcoins} duration={2} />
            </p>
          </div>
        </div>

        {/* Most Popular Deadcoin */}
        <div className="rounded-xl p-[2px] bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600">
          <div className="bg-black/85 backdrop-blur-md rounded-xl p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Most Popular Deadcoin</p>
            <p className="text-lg font-bold text-white">
              {globalStats.mostPopularDeadcoin || "No deadcoin yet"}
            </p>
          </div>
        </div>
      </div>

      {/* Profile CTA ABOVE Trust Pledge */}
      {publicKey && (
        <div className="w-full max-w-5xl flex justify-center">
          <button
            onClick={() => (window.location.href = '/profile')}
            className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-emerald-400 hover:to-cyan-400
                       text-white font-semibold py-3 px-6 rounded-xl shadow-green-500/50
                       hover:scale-110 hover:-translate-y-1 transition-all duration-300 flex items-center gap-2 mt-2"
          >
            <span>🧾</span>
            <span>Go to Profile</span>
          </button>
        </div>
      )}

      {/* Trust Pledge (accordion, default closed) */}
      <div className="w-full max-w-5xl">
        <TrustPledge compact />
      </div>

      {/* Docs CTA under the pledge */}
      <div className="w-full max-w-5xl mt-2 text-center">
        <a
          href="/docs"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
        >
          <span>📘</span>
          <span>Read the Docs</span>
        </a>
      </div>

      {showModal && selectedToken && (
        <CoincarneModal
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null);
            setShowModal(false);
          }}
          refetchTokens={refetchTokens}   // refresh list after successful Coincarnation
          onGoToProfileRequest={() => (window.location.href = '/profile')}
        />
      )}

      {/* Admin panel access */}
      {(isAdminSession || (connected && isAdminWallet)) && (
        <div className="mt-4">
          <a
            href={isAdminSession ? '/admin/tokens' : '/admin/login'}
            className="text-sm text-gray-400 hover:text-gray-200 underline underline-offset-4
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 rounded"
          >
            Go to Admin Panel
          </a>
        </div>
      )}
    </div>
  );
}
