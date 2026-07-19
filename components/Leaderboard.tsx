// components/Leaderboard.tsx
// components/Leaderboard.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { APP_URL } from '@/app/lib/origin';
import ShareCenter from '@/components/share/ShareCenter';
import { buildPayload } from '@/components/share/intent';

function SectionIcon({
  children,
  color = 'rose',
}: {
  children: React.ReactNode;
  color?: 'rose';
}) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/10 text-sm font-black text-rose-300 shadow-sm">
      {children}
    </span>
  );
}

type Props = {
  referralCode?: string;
};

type LeaderboardEntry = {
  scope_key: string;
  identity_id: string | null;
  identity_label: string | null;
  wallet_address: string;
  wallet_addresses?: string[];
  linked_wallet_count: number;
  core_point: number;
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getLinkedWalletCount = (value: unknown): number => {
  return Math.max(1, Math.floor(toFiniteNumber(value, 1)));
};

const shorten = (value: unknown): string => {
  const address = typeof value === 'string' ? value.trim() : '';

  if (!address) return 'Unknown wallet';
  if (address.length <= 10) return address;

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

const isAbortError = (error: unknown): boolean => {
  return error instanceof DOMException && error.name === 'AbortError';
};

export default function Leaderboard({ referralCode }: Props) {
  const { publicKey } = useWallet();

  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareAnchor, setShareAnchor] = useState<string | undefined>(
    undefined
  );
  const [shareTxId, setShareTxId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();

    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);
        setUserRank(null);
        setShowAll(false);

        const res = await fetch('/api/leaderboard', {
          cache: 'no-store',
          signal: controller.signal,
        });

        const json = await res.json().catch(() => ({}));

        if (
          !res.ok ||
          !json?.success ||
          !Array.isArray(json.leaderboard)
        ) {
          throw new Error(
            typeof json?.error === 'string'
              ? json.error
              : 'Leaderboard could not be loaded.'
          );
        }

        const leaderboard = json.leaderboard as LeaderboardEntry[];

        setData(leaderboard);

        if (!publicKey) {
          setUserRank(null);
          return;
        }

        const me = publicKey.toBase58().toLowerCase();

        const index = leaderboard.findIndex((entry) => {
          const wallets =
            Array.isArray(entry.wallet_addresses) &&
            entry.wallet_addresses.length > 0
              ? entry.wallet_addresses
              : [entry.wallet_address];

          return wallets.some(
            (wallet) => String(wallet).toLowerCase() === me
          );
        });

        if (index !== -1) {
          setUserRank(index + 1);
          return;
        }

        const rankRes = await fetch(
          `/api/leaderboard/rank?wallet=${encodeURIComponent(
            publicKey.toBase58()
          )}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const rankJson = await rankRes.json().catch(() => ({}));
        const parsedRank = Number(rankJson?.rank);

        if (
          rankRes.ok &&
          rankJson?.success &&
          Number.isInteger(parsedRank) &&
          parsedRank > 0
        ) {
          setUserRank(parsedRank);
        } else {
          setUserRank(null);
        }
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }

        console.error('Failed to fetch leaderboard:', err);

        setData([]);
        setUserRank(null);
        setError('Leaderboard is temporarily unavailable.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchLeaderboard();

    return () => {
      controller.abort();
    };
  }, [publicKey]);

  const visible = showAll ? data : data.slice(0, 10);

  const shareUrl = useMemo(() => {
    if (!referralCode) {
      return APP_URL;
    }

    try {
      const url = new URL(APP_URL);
      url.searchParams.set('r', referralCode);

      return url.toString();
    } catch {
      return APP_URL;
    }
  }, [referralCode]);

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
    const leaderboardKey = `lb:${wallet}`;

    setShareAnchor(leaderboardKey);
    setShareTxId(leaderboardKey);
    setShareOpen(true);
  };

  return (
    <div className="rounded-2xl border border-rose-400/25 bg-gradient-to-br from-zinc-900/70 to-black/80 p-6 shadow-[0_0_40px_rgba(244,114,182,0.08)] backdrop-blur-lg">
      <div className="mb-2 flex items-center gap-3">
        <SectionIcon color="rose">GLB</SectionIcon>

        <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-300">
          Global Leaderboard
        </h2>
      </div>

      <p className="mb-4 text-sm leading-6 text-zinc-400">
        Ranks are based on Coincarnation Identities, not wallets.
      </p>

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center"
        >
          <p className="text-sm font-semibold text-zinc-300">
            Loading leaderboard...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-8 text-center"
        >
          <p className="text-sm font-semibold text-red-200">
            {error}
          </p>

          <p className="mt-2 text-xs text-zinc-500">
            Please try again shortly.
          </p>
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-zinc-300">
            No ranked identities yet.
          </p>

          <p className="mt-2 text-xs text-zinc-500">
            The leaderboard will appear after identities begin earning
            CorePoints.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Leaderboard */}
          <div className="space-y-2 md:hidden">
            {visible.map((entry) => {
              const realIndex = data.indexOf(entry);
              const myWallet = publicKey?.toBase58() ?? null;

              const wallets =
                Array.isArray(entry.wallet_addresses) &&
                entry.wallet_addresses.length > 0
                  ? entry.wallet_addresses
                  : [entry.wallet_address];

              const isUser = Boolean(
                myWallet &&
                  wallets.some(
                    (wallet) =>
                      String(wallet).toLowerCase() ===
                      myWallet.toLowerCase()
                  )
              );

              const label =
                entry.identity_label ||
                (entry.identity_id
                  ? `Identity #${entry.identity_id.slice(0, 6)}`
                  : shorten(entry.wallet_address));

              const rankLabel =
                realIndex === 0
                  ? '🥇'
                  : realIndex === 1
                    ? '🥈'
                    : realIndex === 2
                      ? '🥉'
                      : `#${realIndex + 1}`;

              const linkedWalletCount = getLinkedWalletCount(
                entry.linked_wallet_count
              );

              const corePoint = Math.max(
                0,
                toFiniteNumber(entry.core_point, 0)
              );

              return (
                <div
                  key={`mobile-${
                    entry.scope_key ||
                    entry.identity_id ||
                    entry.wallet_address
                  }`}
                  className={[
                    'rounded-2xl border px-3 py-3',
                    isUser
                      ? 'border-yellow-400/25 bg-yellow-400/[0.08]'
                      : realIndex === 0
                        ? 'border-amber-400/20 bg-amber-400/[0.06]'
                        : realIndex === 1
                          ? 'border-zinc-400/15 bg-zinc-400/[0.04]'
                          : realIndex === 2
                            ? 'border-orange-400/15 bg-orange-400/[0.04]'
                            : 'border-white/10 bg-black/20',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-sm">
                          {rankLabel}
                        </span>

                        <p className="truncate text-sm font-black text-white">
                          {label}
                        </p>

                        {isUser && (
                          <span className="shrink-0 rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-black text-yellow-300">
                            You
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs font-semibold text-zinc-500">
                        {linkedWalletCount} wallet
                        {linkedWalletCount > 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-emerald-300">
                        {corePoint.toLocaleString('en-US', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                      </p>

                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                        CP
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {!showAll && data.length > 10 && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="text-sm text-pink-400 underline transition hover:text-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/60"
                >
                  Show All
                </button>
              </div>
            )}

            {userRank !== null && (
              <div className="pt-3 text-center">
                <p className="text-xs leading-5 text-zinc-400">
                  Your Coincarnation Identity is ranked{' '}
                  <span className="font-bold text-white">
                    #{userRank}
                  </span>
                  .
                </p>

                <button
                  type="button"
                  onClick={handleShareClick}
                  disabled={!publicKey || !sharePayload}
                  className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Share…
                </button>
              </div>
            )}
          </div>

          {/* Desktop Leaderboard */}
          <div className="hidden w-full overflow-x-auto md:block">
            <div className="mx-auto w-full min-w-[420px] max-w-4xl">
              <table className="w-full table-auto text-center text-sm text-white">
                <thead>
                  <tr className="border-b border-white/10 bg-zinc-800/60 text-center backdrop-blur-sm">
                    <th className="w-[80px] px-2 py-2">Rank</th>
                    <th className="px-4 py-2 text-left">Identity</th>
                    <th className="px-4 py-2">Wallets</th>
                    <th className="px-4 py-2">CorePoint</th>
                  </tr>
                </thead>

                <tbody>
                  {visible.map((entry) => {
                    const realIndex = data.indexOf(entry);
                    const myWallet = publicKey?.toBase58() ?? null;

                    const wallets =
                      Array.isArray(entry.wallet_addresses) &&
                      entry.wallet_addresses.length > 0
                        ? entry.wallet_addresses
                        : [entry.wallet_address];

                    const isUser = Boolean(
                      myWallet &&
                        wallets.some(
                          (wallet) =>
                            String(wallet).toLowerCase() ===
                            myWallet.toLowerCase()
                        )
                    );

                    const label =
                      entry.identity_label ||
                      (entry.identity_id
                        ? `Identity #${entry.identity_id.slice(0, 6)}`
                        : shorten(entry.wallet_address));

                    const linkedWalletCount = getLinkedWalletCount(
                      entry.linked_wallet_count
                    );

                    const corePoint = Math.max(
                      0,
                      toFiniteNumber(entry.core_point, 0)
                    );

                    return (
                      <tr
                        key={
                          entry.scope_key ||
                          entry.identity_id ||
                          entry.wallet_address
                        }
                        className={`border-b border-white/5 transition duration-200 ${
                          isUser
                            ? 'bg-yellow-500/10 font-bold'
                            : realIndex === 0
                              ? 'bg-amber-800/20 shadow-[0_0_20px_rgba(251,191,36,0.10)]'
                              : realIndex === 1
                                ? 'bg-zinc-400/10'
                                : realIndex === 2
                                  ? 'bg-orange-500/10'
                                  : 'hover:bg-white/5'
                        }`}
                      >
                        <td
                          className={[
                            'px-2 py-3 text-lg',
                            realIndex === 0
                              ? 'text-amber-300'
                              : realIndex === 1
                                ? 'text-zinc-200'
                                : realIndex === 2
                                  ? 'text-orange-300'
                                  : '',
                          ].join(' ')}
                        >
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

                            {isUser && (
                              <span className="ml-2 text-yellow-400">
                                ← You
                              </span>
                            )}
                          </div>

                          <div className="mt-1 font-mono text-[11px] text-zinc-500">
                            {entry.identity_id
                              ? 'Personal Value Currency identity'
                              : shorten(entry.wallet_address)}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">
                            {linkedWalletCount} wallet
                            {linkedWalletCount > 1 ? 's' : ''}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-black text-emerald-300">
                          {corePoint.toLocaleString('en-US', {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!showAll && data.length > 10 && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="text-sm text-pink-400 underline transition hover:text-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/60"
                  >
                    Show All
                  </button>
                </div>
              )}

              {userRank !== null && (
                <div className="mt-6 space-y-3 text-center">
                  <p className="text-sm text-zinc-400">
                    Your Coincarnation Identity is currently ranked{' '}
                    <span className="font-bold text-white">
                      #{userRank}
                    </span>{' '}
                    in the ecosystem.
                  </p>

                  <button
                    type="button"
                    onClick={handleShareClick}
                    disabled={!publicKey || !sharePayload}
                    className="inline-block rounded-md bg-blue-600 px-3 py-1 text-sm text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Share…
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
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