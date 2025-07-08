'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface LeaderboardEntry {
  wallet_address: string;
  core_point: number;
}

export default function Leaderboard() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { publicKey } = useWallet();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        const json = await res.json();
        if (json.success) {
          setData(json.leaderboard);
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const shorten = (address: string) =>
    `${address.slice(0, 4)}...${address.slice(-4)}`;

  return (
    <div className="mt-10 border border-white/10 rounded-2xl p-6 bg-black/30 shadow-md backdrop-blur">
      <h2 className="text-xl font-bold mb-4 text-white">🌍 Global Leaderboard</h2>
      {loading ? (
        <p className="text-white">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-white">
            <thead>
              <tr className="text-left border-b border-white/10">
                <th className="py-2 px-4">Rank</th>
                <th className="py-2 px-4">Wallet</th>
                <th className="py-2 px-4">CorePoint</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry, index) => {
                const isUser = publicKey?.toBase58() === entry.wallet_address;
                return (
                  <tr
                    key={entry.wallet_address}
                    className={`border-b border-white/5 ${isUser ? 'bg-yellow-500/10 font-bold' : ''}`}
                  >
                    <td className="py-2 px-4">{index + 1}</td>
                    <td className="py-2 px-4">
                      {shorten(entry.wallet_address)}
                      {isUser && <span className="ml-2 text-yellow-400">← You</span>}
                    </td>
                    <td className="py-2 px-4">{entry.core_point}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
