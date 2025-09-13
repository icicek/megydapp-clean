// components/HomePage.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import CountUp from 'react-countup';

import CoincarneModal from '@/components/CoincarneModal';
import ConnectWalletCTA from '@/components/wallet/ConnectWalletCTA';
import TrustPledge from '@/components/TrustPledge';
import Skeleton from '@/components/ui/Skeleton';

import { useWalletTokens, TokenInfo } from '@/hooks/useWalletTokens';

export default function HomePage() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const pubkeyBase58 = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);

  // ---------- Admin checks (SAFE) ----------
  const [isAdminWallet, setIsAdminWallet] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);

  // whoami (sessiz mod) – 401 atmaz; { ok: boolean } döner
  const checkAdminSession = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/whoami?strict=0', {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'x-admin-sync': '1' },
        signal,
      });
      if (!res.ok) {
        // sessiz modda bile non-OK gelirse false'a çek
        setIsAdminSession(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setIsAdminSession(Boolean(data?.ok));
    } catch {
      setIsAdminSession(false);
    }
  };

  // mount + wallet değişiminde bir kere kontrol
  useEffect(() => {
    const ac = new AbortController();
    checkAdminSession(ac.signal);
    return () => ac.abort();
    // publicKey/connected değişince tekrar denemek yeterli
  }, [pubkeyBase58, connected]);

  // Sekme odaklanınca tekrar kontrol (sessiz)
  useEffect(() => {
    const handler = () => checkAdminSession();
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, []);

  // Allowlist (admin cüzdan mı?)
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      if (!connected || !pubkeyBase58) {
        setIsAdminWallet(false);
        return;
      }
      try {
        const res = await fetch(`/api/admin/is-allowed?wallet=${pubkeyBase58}`, {
          cache: 'no-store',
          signal: ac.signal,
        });
        const j = await res.json().catch(() => null);
        setIsAdminWallet(Boolean(j?.allowed));
      } catch {
        setIsAdminWallet(false);
      }
    })();
    return () => ac.abort();
  }, [pubkeyBase58, connected]);

  // ---------- Tokens (anti-flicker) ----------
  const {
    tokens,
    loading: tokensLoading, // only initial
    refreshing, // background sync (no flicker)
    error: tokensError, // only initial error
    refetchTokens,
  } = useWalletTokens({
    autoRefetchOnFocus: true,
    autoRefetchOnAccountChange: true,
    pollMs: 20000, // silent background refresh
  });

  // ---------- Modal state ----------
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showModal, setShowModal] = useState(false);

  // ---------- Global & user stats ----------
  const [globalStats, setGlobalStats] = useState({
    totalUsd: 0,
    totalParticipants: 0,
    uniqueDeadcoins: 0,
    mostPopularDeadcoin: '',
  });
  const [userContribution, setUserContribution] = useState(0);

  // Initial global stats
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/coincarnation/stats', { cache: 'no-store', signal: ac.signal });
        const data = await res.json();
        if (data?.success) setGlobalStats(data);
      } catch {}
    })();
    return () => ac.abort();
  }, []);

  // Re-fetch user stats when wallet is connected
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

        if (globalData?.success) setGlobalStats(globalData);
        if (userData?.success) setUserContribution(Number(userData?.data?.total_usd_contributed || 0));
      } catch {}
    })();
    return () => ac.abort();
  }, [pubkeyBase58, connected]);

  // ---------- Handlers ----------
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mint = e.target.value;
    const token = tokens.find((t) => t.mint === mint) || null;
    setSelectedToken(token);
    setShowModal(Boolean(token));
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

      <div className="w-full flex md:hidden justify-center my-5">
        <div className="w-full max-w-xs">
          <ConnectWalletCTA />
        </div>
      </div>

      <div className="w-full max-w-5xl bg-gradient-to-br from-gray-900 via-zinc-800 to-gray-900 p-8 rounded-2xl border border-purple-700 shadow-2xl">
        <h2 className="text-lg mb-1 text-left">You give</h2>
        <p className="text-xs text-gray-400 text-left mb-2">
          Walking deadcoins, memecoins, any unsupported assets…
        </p>

        {publicKey ? (
          <>
            {tokensLoading && tokens.length === 0 ? (
              <div className="space-y-2 mb-4" data-testid="tokens-skeleton">
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

                <select
                  className="w-full bg-gray-800 text-white p-3 rounded mb-2 border border-gray-600"
                  value={selectedToken?.mint || ''}
                  onChange={handleSelectChange}
                >
                  <option value="" disabled>
                    👉 Select a token to Coincarnate
                  </option>
                  {tokens.map((token, idx) => (
                    <option key={idx} value={token.mint}>
                      {token.symbol ?? token.mint.slice(0, 4)} — {token.amount.toFixed(4)}
                    </option>
                  ))}
                </select>

                {!tokensLoading && tokens.length === 0 && tokensError && (
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
        <p className="text-xs text-gray-400 text-left mb-2">
          $MEGY — the currency of the Fair Future Fund
        </p>

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

      {showModal && selectedToken && (
        <CoincarneModal
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null);
            setShowModal(false);
          }}
          refetchTokens={refetchTokens}
          onGoToProfileRequest={() => router.push('/profile')}
        />
      )}

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
