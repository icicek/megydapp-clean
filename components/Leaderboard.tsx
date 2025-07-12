'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface LeaderboardEntry {
  wallet_address: string;
  core_point: number;
}

export default function Leaderboard() {
  const { publicKey } = useWallet();

  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        const json = await res.json();
        if (json.success) {
          setData(json.leaderboard);

          if (
            publicKey &&
            !json.leaderboard.some((entry: LeaderboardEntry) => entry.wallet_address === publicKey.toBase58())
          ) {
            const rankRes = await fetch(`/api/leaderboard/rank?wallet=${publicKey.toBase58()}`);
            const rankJson = await rankRes.json();
            if (rankJson.success) {
              setUserRank(rankJson.rank);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [publicKey]);

  const shorten = (address: string) =>
    `${address.slice(0, 4)}...${address.slice(-4)}`;

  const visibleData = showAll ? data : data.slice(0, 10);

  return (
    <div className="mt-10 border border-pink-500/20 rounded-2xl p-6 bg-gradient-to-br from-zinc-900/70 to-black/80 shadow-xl backdrop-blur-lg">
      <h2 className="text-xl font-bold mb-4 text-white">🌍 Global Leaderboard</h2>
      {loading ? (
        <p className="text-white">Loading...</p>
      ) : (
        <>
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[360px] max-w-4xl mx-auto text-sm text-white text-center table-auto">
              <thead>
                <tr className="text-center border-b border-white/10 bg-zinc-800/60 backdrop-blur-sm">
                  <th className="py-2 px-3 text-center">Rank</th>
                  <th className="py-2 px-4 text-center">Wallet</th>
                  <th className="py-2 px-4 text-center">CorePoint</th>
                </tr>
              </thead>
              <tbody>
                {visibleData.map((entry, index) => {
                  const isUser = publicKey?.toBase58() === entry.wallet_address;
                  const realIndex = data.indexOf(entry);
                  return (
                    <tr
                      key={entry.wallet_address}
                      className={`border-b border-white/5 transition duration-200 ${
                        isUser
                          ? 'bg-yellow-500/10 font-bold'
                          : realIndex === 0
                          ? 'bg-amber-800/20'
                          : realIndex === 1
                          ? 'bg-gray-700/20'
                          : realIndex === 2
                          ? 'bg-orange-600/10'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <td className="py-2 px-3 text-center">
                        {realIndex === 0
                          ? '🥇'
                          : realIndex === 1
                          ? '🥈'
                          : realIndex === 2
                          ? '🥉'
                          : realIndex + 1}
                      </td>
                      <td className="py-2 px-4 text-center">
                        {shorten(entry.wallet_address)}
                        {isUser && (
                          <span className="ml-2 text-yellow-400">← You</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-center">
                        {Number(entry.core_point).toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Show All Button */}
          {!showAll && data.length > 10 && (
            <div className="text-center mt-4">
              <button
                onClick={() => setShowAll(true)}
                className="text-sm text-pink-400 hover:text-pink-300 underline transition"
              >
                Show All
              </button>
            </div>
          )}

          {/* User Rank & Share */}
          {userRank && (
            <>
              <p className="text-center text-sm text-zinc-400 mt-6">
                You are currently ranked{' '}
                <span className="text-white font-bold">#{userRank}</span> in the ecosystem.
              </p>
              <div className="text-center mt-2">
                <a
                  href={`https://twitter.com/intent/tweet?text=Everyone%20says%20%E2%80%9Chodl.%E2%80%9D%0AI%20said%20%E2%80%9Crevive.%E2%80%9D%0ANow%20I%E2%80%99m%20%23${userRank}%20on%20the%20Coincarnation%20Leaderboard.%0AWhat%E2%80%99s%20your%20excuse%3F%0A%E2%86%92%20https%3A%2F%2Fcoincarnation.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-blue-400 hover:text-blue-300 underline transition"
                >
                  Share your rank on X
                </a>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
