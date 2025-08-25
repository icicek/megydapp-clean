"use client";

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import CoincarneModal from '@/components/CoincarneModal';
import { fetchSolanaTokenList } from '@/lib/utils';
import { connection } from '@/lib/solanaConnection';
import CountUp from 'react-countup';
import { fetchTokenMetadata } from '@/app/api/utils/fetchTokenMetadata';
import ConnectWalletCTA from '@/components/wallet/ConnectWalletCTA';

interface TokenInfo {
  mint: string;
  amount: number;
  symbol?: string;
  logoURI?: string;
}

export default function HomePage() {
  const { publicKey, connected } = useWallet();

  // Admin session (whoami)
  const [isAdminSession, setIsAdminSession] = useState(false);

  // ❶ Mount + cüzdan değişiminde admin session'ı kontrol et
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
  }, [publicKey]);

  // ❷ Sekme odaklandığında yeniden kontrol et
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

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [globalStats, setGlobalStats] = useState({
    totalUsd: 0,
    totalParticipants: 0,
    uniqueDeadcoins: 0,
    mostPopularDeadcoin: '',
  });

  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        const res = await fetch('/api/coincarnation/stats');
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

    const fetchWalletTokens = async () => {
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });

        const tokenListRaw: TokenInfo[] = tokenAccounts.value
          .map(({ account }) => {
            const parsed = account.data.parsed;
            return {
              mint: parsed.info.mint,
              amount: parseFloat(parsed.info.tokenAmount.uiAmountString || '0'),
            };
          })
          .filter((t) => t.amount > 0);

        // SOL balance
        const solBalance = await connection.getBalance(publicKey);
        if (solBalance > 0) {
          tokenListRaw.unshift({
            mint: 'SOL',
            amount: solBalance / 1e9,
            symbol: 'SOL',
          });
        }

        // Token list (cached)
        const tokenMetadata = await fetchSolanaTokenList();

        // Enrich
        const enriched = await Promise.all(
          tokenListRaw.map(async (token) => {
            if (token.mint === 'SOL') return token;

            const metadata = tokenMetadata.find((meta) => meta.address === token.mint);
            if (metadata) {
              return { ...token, symbol: metadata.symbol, logoURI: metadata.logoURI };
            }

            const fallbackMeta = await fetchTokenMetadata(token.mint);
            return {
              ...token,
              symbol: fallbackMeta?.symbol || token.mint.slice(0, 4),
              logoURI: undefined,
            };
          })
        );

        setTokens(enriched);
      } catch (err) {
        console.error('❌ Error fetching wallet tokens:', err);
      }
    };

    const fetchStats = async () => {
      try {
        const [globalRes, userRes] = await Promise.all([
          fetch('/api/coincarnation/stats'),
          fetch(`/api/claim/${publicKey.toBase58()}`)
        ]);
        const globalData = await globalRes.json();
        const userData = await userRes.json();

        if (globalData.success) setGlobalStats(globalData);
        if (userData.success) setUserContribution(userData.data.total_usd_contributed);
      } catch (err) {
        console.error('❌ Failed to fetch stats or user data:', err);
      }
    };

    fetchWalletTokens();
    fetchStats();
  }, [publicKey, connected]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mint = e.target.value;
    const token = tokens.find(t => t.mint === mint);
    if (token) {
      setSelectedToken(token);
      setShowModal(true);
    }
  };

  const shareRatio = globalStats.totalUsd > 0 ? userContribution / globalStats.totalUsd : 0;
  const sharePercentage = (shareRatio * 100).toFixed(2);

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
        <p className="text-xs text-gray-400 text-left mb-2">Walking Deadcoins, Memecoins, deadcoins...</p>

        {publicKey ? (
          <select
            className="w-full bg-gray-800 text-white p-3 rounded mb-4 border border-gray-600"
            value={selectedToken?.mint || ''}
            onChange={handleSelectChange}
          >
            <option value="" disabled>👉 Select a token to Coincarnate</option>
            {tokens.map((token, idx) => (
              <option key={idx} value={token.mint}>
                {token.symbol} — {token.amount.toFixed(4)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-gray-400">Connect your wallet to see your tokens.</p>
        )}

        <div className="text-2xl my-4 text-center">↔️</div>

        <h2 className="text-lg text-left mb-2">You receive</h2>
        <p className="text-xs text-gray-400 text-left mb-2">$MEGY - the currency of the Fair Future Fund</p>

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

          <p className="text-sm text-gray-300 mt-2 text-left">🌍 Your personal contribution to the Fair Future Fund (% of total)</p>
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

      {showModal && selectedToken && (
        <CoincarneModal
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null);
            setShowModal(false);
          }}
          onGoToProfileRequest={() => (window.location.href = '/profile')}
        />
      )}

      {publicKey && (
        <button
          onClick={() => (window.location.href = '/profile')}
          className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-semibold py-3 px-6 rounded-xl shadow-green-500/50 hover:scale-110 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center space-x-2 mt-6"
        >
          <span>🧾</span>
          <span>Go to Profile</span>
        </button>
      )}

      {/* Admin panel erişimi (yalnızca admin session varsa) */}
      {isAdminSession && (
        <div className="flex flex-col items-center gap-3 mt-4">
          <button
            onClick={() => (window.location.href = '/admin/tokens')}
            className="bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-semibold py-3 px-6 rounded-xl shadow-fuchsia-500/40 hover:scale-105 transition-all"
          >
            🔐 Go to Admin Panel
          </button>
        </div>
      )}
    </div>
  );
}
