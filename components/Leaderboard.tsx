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

          // Kullanıcı listede yoksa, rank API'sini çağır
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
    <div className="mt-10 border border-pink-500/30 rounded-2xl p-6 bg-gradient-to-br from-black/50 to-zinc-900/70 shadow-lg backdrop-blur-xl">
      <h2 className="text-xl font-bold mb-4 text-white">🌍 Global Leaderboard</h2>
      {loading ? (
        <p className="text-white">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[500px] text-sm text-white">
            <thead>
              <tr className="text-left border-b border-white/10">
                <th className="py-2 px-4">Rank</th>
                <th className="py-2 px-4">Wallet</th>
                <th className="py-2 px-4">CorePoint</th>
              </tr>
            </thead>
            <tbody>
              {visibleData.map((entry, index) => {
                const isUser = publicKey?.toBase58() === entry.wallet_address;
                const realIndex = data.indexOf(entry);
                return (
                  <tr
                    key={entry.wallet_address}
                    className={`border-b border-white/5 ${
                      isUser ? 'bg-yellow-500/10 font-bold' : ''
                    }`}
                  >
                    <td className="py-2 px-4">
                      {realIndex === 0
                        ? '🥇'
                        : realIndex === 1
                        ? '🥈'
                        : realIndex === 2
                        ? '🥉'
                        : realIndex + 1}
                    </td>
                    <td className="py-2 px-4">
                      {shorten(entry.wallet_address)}
                      {isUser && (
                        <span className="ml-2 text-yellow-400">← You</span>
                      )}
                    </td>
                    <td className="py-2 px-4">{entry.core_point}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

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

          {/* Eğer kullanıcı ilk 50'de yoksa */}
          {userRank && (
            <p className="text-center text-sm text-zinc-400 mt-6">
              You are currently ranked{' '}
              <span className="text-white font-bold">#{userRank}</span> in the ecosystem.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
