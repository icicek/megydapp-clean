// components/Leaderboard.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { APP_URL } from '@/app/lib/origin';
import dynamic from 'next/dynamic';

type Props = { referralCode?: string };
type LeaderboardEntry = {
  wallet_address: string;
  core_point: number;
};

const ShareCenter = dynamic(
  () => import('@/components/share/ShareCenter').then(m => m.default),
  { ssr: false, loading: () => null }
);

export default function Leaderboard({ referralCode }: Props) {
  const { publicKey } = useWallet();

  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Share modal state
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        const json = await res.json();
        if (json?.success && Array.isArray(json.leaderboard)) {
          setData(json.leaderboard as LeaderboardEntry[]);

          if (publicKey) {
            const me = publicKey.toBase58();
            const i = json.leaderboard.findIndex(
              (e: LeaderboardEntry) => e.wallet_address === me
            );
            if (i !== -1) {
              setUserRank(i + 1);
            } else {
              const rankRes = await fetch(`/api/leaderboard/rank?wallet=${me}`);
              const rankJson = await rankRes.json();
              if (rankJson?.success && Number.isFinite(rankJson.rank)) {
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

  const shorten = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;
  const visible = showAll ? data : data.slice(0, 10);

  // ---- Share payload (rank metni dinamik) ----
  const shareUrl = useMemo(
    () => (referralCode ? `${APP_URL}?r=${referralCode}` : APP_URL),
    [referralCode]
  );  
  const shareText = useMemo(() => {
      const r = userRank;
      const base = r
        ? `Everyone says “hodl.” I said “revive.” Now I’m #${r} on the #Coincarnation Leaderboard.`
        : `Everyone says “hodl.” I said “revive.” Join the #Coincarnation Leaderboard.`;
      return `${base}\n${shareUrl}`;
  }, [userRank, shareUrl]);

  const sharePayload = useMemo(
    () => ({
      url: shareUrl,
      text: shareText,
      hashtags: ['MEGY', 'Coincarnation', 'FairFutureFund'],
      via: 'Coincarnation',
      utm: 'utm_source=share&utm_medium=leaderboard&utm_campaign=rank',
    }),
    [shareText, shareUrl]
  );

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
                {visible.map((entry, _i) => {
                  const realIndex = data.indexOf(entry);
                  const isUser = publicKey?.toBase58() === entry.wallet_address;
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

            {/* Share (ShareCenter modalını açar) */}
            {userRank && (
              <div className="text-center mt-6 space-y-3">
                <p className="text-sm text-zinc-400">
                  You are currently ranked{' '}
                  <span className="text-white font-bold">#{userRank}</span> in the ecosystem.
                </p>

                <button
                  onClick={() => setShareOpen(true)}
                  className="inline-block text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md transition"
                >
                  Share…
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share modal */}
      <ShareCenter
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={sharePayload}
        context="leaderboard"
        walletBase58={publicKey?.toBase58() ?? null}
        onAfterShare={async ({ channel }) => {
          try {
            await fetch('/api/share/record', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channel, context: 'leaderboard' }),
            });
          } catch {
            /* noop */
          }
        }}
      />
    </div>
  );
}
