// components/Leaderboard.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { APP_URL } from '@/app/lib/origin';
import ShareCenter from '@/components/share/ShareCenter';
import { buildPayload } from '@/components/share/intent';

type Props = { referralCode?: string };

type LeaderboardEntry = {
  scope_key: string;
  identity_id: string | null;
  identity_label: string | null;
  wallet_address: string;
  wallet_addresses?: string[];
  linked_wallet_count: number;
  core_point: number;
};

export default function Leaderboard({ referralCode }: Props) {
  const { publicKey } = useWallet();

  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareAnchor, setShareAnchor] = useState<string | undefined>(undefined);
  const [shareTxId, setShareTxId] = useState<string | undefined>(undefined);

  const shorten = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);

        const res = await fetch('/api/leaderboard', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));

        if (json?.success && Array.isArray(json.leaderboard)) {
          const leaderboard = json.leaderboard as LeaderboardEntry[];
          setData(leaderboard);

          if (publicKey) {
            const me = publicKey.toBase58();

            const i = leaderboard.findIndex((entry) => {
              const wallets = Array.isArray(entry.wallet_addresses)
                ? entry.wallet_addresses
                : [entry.wallet_address];

              return wallets.some(
                (w) => String(w).toLowerCase() === me.toLowerCase()
              );
            });

            if (i !== -1) {
              setUserRank(i + 1);
            } else {
              const rankRes = await fetch(
                `/api/leaderboard/rank?wallet=${encodeURIComponent(me)}`,
                { cache: 'no-store' }
              );

              const rankJson = await rankRes.json().catch(() => ({}));

              if (rankJson?.success && Number.isFinite(Number(rankJson.rank))) {
                setUserRank(Number(rankJson.rank));
              } else {
                setUserRank(null);
              }
            }
          } else {
            setUserRank(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };

    void fetchLeaderboard();
  }, [publicKey]);

  const visible = showAll ? data : data.slice(0, 10);

  const shareUrl = useMemo(
    () => (referralCode ? `${APP_URL}?r=${encodeURIComponent(referralCode)}` : APP_URL),
    [referralCode]
  );

  const sharePayload = useMemo(() => {
    return buildPayload(
      'leaderboard',
      {
        url: shareUrl,
        rank: userRank ?? undefined,
      },
      {
        ref: referralCode ?? undefined,
        src: 'app',
      }
    );
  }, [shareUrl, userRank, referralCode]);

  const handleShareClick = () => {
    if (!sharePayload || !publicKey) return;

    const wallet = publicKey.toBase58();
    const lbKey = `lb:${wallet}`;

    setShareAnchor(lbKey);
    setShareTxId(lbKey);
    setShareOpen(true);
  };

  return (
    <div className="mt-10 rounded-2xl border border-pink-500/20 bg-gradient-to-br from-zinc-900/70 to-black/80 p-6 shadow-xl backdrop-blur-lg">
      <h2 className="mb-2 text-xl font-bold text-white">🌍 Global Leaderboard</h2>

      <p className="mb-4 text-sm leading-6 text-zinc-400">
        Ranking is based on Coincarnation Identity, not individual wallets.
        One person, one identity, one Personal Value Currency.
      </p>

      {loading ? (
        <p className="text-white">Loading...</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <div className="mx-auto w-full min-w-[420px] max-w-4xl">
            <table className="w-full table-auto text-center text-sm text-white">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-800/60 text-center backdrop-blur-sm">
                  <th className="w-[80px] px-2 py-2">Rank</th>
                  <th className="px-4 py-2">Identity</th>
                  <th className="px-4 py-2">Wallets</th>
                  <th className="px-4 py-2">CorePoint</th>
                </tr>
              </thead>

              <tbody>
                {visible.map((entry) => {
                  const realIndex = data.indexOf(entry);
                  const myWallet = publicKey?.toBase58() ?? null;

                  const wallets = Array.isArray(entry.wallet_addresses)
                    ? entry.wallet_addresses
                    : [entry.wallet_address];

                  const isUser = Boolean(
                    myWallet &&
                      wallets.some(
                        (w) => String(w).toLowerCase() === myWallet.toLowerCase()
                      )
                  );

                  const label =
                    entry.identity_label ||
                    (entry.identity_id
                      ? `Identity #${entry.identity_id.slice(0, 6)}`
                      : shorten(entry.wallet_address));

                  return (
                    <tr
                      key={entry.scope_key || entry.identity_id || entry.wallet_address}
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
                      <td className="px-2 py-3">
                        {realIndex === 0
                          ? '🥇'
                          : realIndex === 1
                            ? '🥈'
                            : realIndex === 2
                              ? '🥉'
                              : realIndex + 1}
                      </td>

                      <td className="px-4 py-3 text-left">
                        <div className="font-black text-white">
                          {label}
                          {isUser && <span className="ml-2 text-yellow-400">← You</span>}
                        </div>

                        <div className="mt-1 font-mono text-[11px] text-zinc-500">
                          {entry.identity_id
                            ? 'Personal Value Currency identity'
                            : shorten(entry.wallet_address)}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">
                          {Number(entry.linked_wallet_count || 1)} wallet
                          {Number(entry.linked_wallet_count || 1) > 1 ? 's' : ''}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-black text-emerald-300">
                        {Number(entry.core_point || 0).toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!showAll && data.length > 10 && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowAll(true)}
                  className="text-sm text-pink-400 underline transition hover:text-pink-300"
                >
                  Show All
                </button>
              </div>
            )}

            {userRank && (
              <div className="mt-6 space-y-3 text-center">
                <p className="text-sm text-zinc-400">
                  Your Coincarnation Identity is currently ranked{' '}
                  <span className="font-bold text-white">#{userRank}</span> in the ecosystem.
                </p>

                <button
                  onClick={handleShareClick}
                  disabled={!sharePayload}
                  className="inline-block rounded-md bg-blue-600 px-3 py-1 text-sm text-white transition hover:bg-blue-700"
                >
                  Share…
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {shareOpen && sharePayload && (
        <ShareCenter
          open={shareOpen}
          onOpenChange={setShareOpen}
          payload={sharePayload}
          context="leaderboard"
          walletBase58={publicKey?.toBase58() ?? null}
          anchor={shareAnchor}
          txId={shareTxId}
        />
      )}
    </div>
  );
}