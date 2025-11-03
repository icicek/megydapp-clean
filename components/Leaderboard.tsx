'use client';

import React, { useEffect, useMemo, useState, type JSX } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import ShareCenter from '@/components/share/ShareCenter';
import { buildRankText } from '@/utils/shareX';
import { APP_URL } from '@/app/lib/origin';

interface LeaderboardEntry {
  wallet_address: string;
  core_point: number;
}

export default function Leaderboard(): JSX.Element {
  const { publicKey } = useWallet();

  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  // ShareCenter modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [rankToShare, setRankToShare] = useState<number | null>(null);
  const totalToShare = useMemo(() => (data?.length ?? 0) || undefined, [data]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        const json = await res.json();
        if (json.success) {
          setData(json.leaderboard as LeaderboardEntry[]);

          if (publicKey) {
            const base58 = publicKey.toBase58();
            const indexInTop = (json.leaderboard as LeaderboardEntry[]).findIndex(
              (entry) => entry.wallet_address === base58
            );
            if (indexInTop !== -1) {
              setUserRank(indexInTop + 1);
            } else {
              const rankRes = await fetch(`/api/leaderboard/rank?wallet=${base58}`);
              const rankJson = await rankRes.json();
              if (rankJson.success) {
                setUserRank(rankJson.rank);
              }
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

  const shorten = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;
  const visibleData = showAll ? data : data.slice(0, 10);

  const tweetMessage = useMemo(() => {
    if (!userRank) return 'Join the Coincarnation movement → https://coincarnation.com';
    // Kopyalama butonu için alternatif metin
    return `Everyone says “hodl.”\nI said “revive.”\nNow I’m #${userRank} on the #Coincarnation Leaderboard.\nWhat’s your excuse?\n→ https://coincarnation.com`;
  }, [userRank]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tweetMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="mt-10 border border-pink-500/20 rounded-2xl p-6 bg-gradient-to-br from-zinc-900/70 to-black/80 shadow-xl backdrop-blur-lg">
      <h2 className="text-xl font-bold mb-4 text-white">🌍 Global Leaderboard</h2>

      {loading ? (
        <p className="text-white">Loading...</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <div className="min-w-[360px] w-full max-w-4xl mx-auto">
            <table className="w-full text-sm text-white text-center table-auto">
              <thead>
                <tr className="text-center border-b border-white/10 bg-zinc-800/60 backdrop-blur-sm">
                  <th className="py-2 px-2 w-[80px]">Rank</th>
                  <th className="py-2 px-4">Wallet</th>
                  <th className="py-2 px-4">CorePoint</th>
                </tr>
              </thead>
              <tbody>
                {visibleData.map((entry, i) => {
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
                      <td className="py-2 px-2">
                        {realIndex === 0 ? '🥇' : realIndex === 1 ? '🥈' : realIndex === 2 ? '🥉' : realIndex + 1}
                      </td>
                      <td className="py-2 px-4">
                        {shorten(entry.wallet_address)}
                        {isUser && <span className="ml-2 text-yellow-400">← You</span>}
                      </td>
                      <td className="py-2 px-4">{Number(entry.core_point).toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

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
                  You are currently ranked <span className="text-white font-bold">#{userRank}</span> in the ecosystem.
                </p>

                <div className="text-center mt-2 space-y-2">
                  {/* 🔁 Çoklu platform paylaşım için ShareCenter modalını tetikleyen nötr buton */}
                  <button
                    onClick={() => {
                      setRankToShare(userRank);
                      setShareOpen(true);
                    }}
                    className="inline-block text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md transition"
                  >
                    Share…
                  </button>

                  <br />

                  {/* 📝 İsteyenler için “metni kopyala” */}
                  <button
                    onClick={handleCopy}
                    className="text-sm text-green-400 hover:text-green-300 underline transition"
                  >
                    {copied ? '✅ Copied! Now paste it into Twitter.' : 'Copy Tweet Text'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 📤 ShareCenter Modal */}
      <ShareCenter
        open={shareOpen}
        onOpenChange={setShareOpen}
        // tek satır payload: rank metnini dinamik üret
        payload={{
          url: APP_URL,
          text: buildRankText({ rank: rankToShare ?? 0, total: totalToShare }),
          hashtags: ['MEGY', 'Coincarnation', 'Solana'],
          via: 'Coincarnation',
          utm: 'utm_source=share&utm_medium=leaderboard&utm_campaign=rank',
        } as any}
        context="leaderboard"
        onAfterShare={async ({ channel, context }) => {
          try {
            await fetch('/api/share/record', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                // publicKey yoksa sadece kanal/context kaydı tutmak da kabul
                wallet_address: publicKey ? publicKey.toBase58() : undefined,
                channel,
                context,
                txId: null,
              }),
            });
          } catch (e) {
            console.error('share record error', e);
          }
        }}
      />
    </div>
  );
}
