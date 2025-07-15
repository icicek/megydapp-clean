'use client';

import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import CoincarneModal from '@/components/CoincarneModal';
import { fetchSolanaTokenList } from '@/lib/utils';
import { connection } from '@/lib/solanaConnection';

interface TokenInfo {
  mint: string;
  amount: number;
  symbol?: string;
  logoURI?: string;
}

interface TokenMeta {
  address: string;
  symbol?: string;
  logoURI?: string;
}

export default function HomePage() {
  const { publicKey, connected } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [globalStats, setGlobalStats] = useState({
    totalUsd: 0,
    totalParticipants: 0,
    uniqueDeadcoins: 0,
    mostPopularDeadcoin: '',
  });
  const [userContribution, setUserContribution] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) localStorage.setItem('referralCode', ref);
    }
  }, []);

  useEffect(() => {
    if (!publicKey || !connected) return;

    const fetchWalletTokens = async () => {
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
        const tokenListRaw: TokenInfo[] = tokenAccounts.value.map(({ account }) => {
          const parsed = account.data.parsed;
          return { mint: parsed.info.mint, amount: parseFloat(parsed.info.tokenAmount.uiAmountString || '0') };
        }).filter(t => t.amount > 0);

        const solBalance = await connection.getBalance(publicKey);
        if (solBalance > 0) tokenListRaw.unshift({ mint: 'SOL', amount: solBalance / 1e9, symbol: 'SOL' });

        const tokenMetadata: TokenMeta[] = await fetchSolanaTokenList();
        const enriched = tokenListRaw.map(token => {
          if (token.mint === 'SOL') return token;
          const metadata = tokenMetadata.find(t => t.address === token.mint);
          return { ...token, symbol: metadata?.symbol, logoURI: metadata?.logoURI };
        });
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
    const token = tokens.find(t => t.mint === mint || (mint === 'SOL' && t.mint === 'SOL'));
    if (token) {
      setSelectedToken(token);
      setShowModal(true);
    }
  };

  const shareRatio = globalStats.totalUsd > 0 ? userContribution / globalStats.totalUsd : 0;
  const sharePercentage = (shareRatio * 100).toFixed(2);

  const cardBaseClasses = "relative p-6 rounded-2xl text-center shadow-xl border-2 transform transition-all duration-500 ease-in-out hover:scale-110 hover:rotate-1 tracking-wide overflow-hidden";

  function StatCard({ fromColor, toColor, borderColor, title, value }: any) {
    return (
      <div className={`${cardBaseClasses} bg-gradient-to-br ${fromColor} ${toColor} border-${borderColor}`}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-md"></div>
        <div className="relative z-10">
          <p className="text-sm text-gray-200 mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    );
  }  

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white flex flex-col items-center p-6 space-y-8">

      <div className="w-full flex justify-end">
        <WalletMultiButton />
      </div>

      <section className="text-center py-8 w-full">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-2">Turn Deadcoins into a Fair Future.</h1>
        <p className="text-lg md:text-xl text-pink-400 mb-1">This is not a swap. This is reincarnation.</p>
        <p className="text-sm text-gray-300 max-w-xl mx-auto">Burning wealth inequality. One deadcoin at a time.</p>
      </section>

      <div className="w-full max-w-5xl bg-gradient-to-br from-gray-900 via-zinc-800 to-gray-900 p-8 rounded-2xl border border-purple-700 shadow-2xl">
        <h2 className="text-lg mb-1 text-left">You give</h2>
        <p className="text-xs text-gray-400 text-left mb-2">Walking Deadcoins, Memecoins, deadcoins...</p>

        {publicKey ? (
          <select className="w-full bg-gray-800 text-white p-3 rounded mb-4 border border-gray-600" defaultValue="" onChange={handleSelectChange}>
            <option value="" disabled>👉 Select a token to Coincarnate</option>
            {tokens.map((token, idx) => (
              <option key={idx} value={token.mint}>{token.symbol || token.mint.slice(0, 4)} — {token.amount.toFixed(4)}</option>
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

      <div className="mt-10 w-full max-w-5xl">
        <h2 className="text-2xl font-bold text-center mb-6">🌐 Global Contribution Stats</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            fromColor="from-fuchsia-600"
            toColor="to-pink-500"
            borderColor="fuchsia-500"
            title="Total Participants"
            value={globalStats.totalParticipants.toLocaleString()}
          />
          <StatCard
            fromColor="from-emerald-500"
            toColor="to-teal-400"
            borderColor="emerald-500"
            title="Total USD Contributed"
            value={`$${globalStats.totalUsd.toLocaleString()}`}
          />
          <StatCard
            fromColor="from-yellow-500"
            toColor="to-orange-400"
            borderColor="yellow-500"
            title="Unique Deadcoins Revived"
            value={globalStats.uniqueDeadcoins}
          />
          <StatCard
            fromColor="from-cyan-500"
            toColor="to-indigo-500"
            borderColor="cyan-500"
            title="Most Popular Deadcoin"
            value={globalStats.mostPopularDeadcoin}
          />
        </div>
      </div>

      {showModal && selectedToken && (
        <CoincarneModal
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null);
            setShowModal(false);
          }}
          onGoToProfileRequest={() => window.location.href = '/profile'}
        />
      )}

      {publicKey && (
        <div>
          <button
            onClick={() => window.location.href = '/profile'}
            className="bg-gradient-to-r from-green-500 to-teal-500 text-white font-semibold py-3 px-6 rounded-xl shadow hover:scale-105 transition-all duration-200 mt-6"
          >
            🧾 Go to Profile
          </button>
        </div>
      )}
    </div>
  );
}
