// components/ConfirmModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import dynamic from 'next/dynamic';

type DeadcoinVoteButtonProps = {
  mint: string;
  onVoted?: (res: { applied?: boolean; votesYes?: number; threshold?: number }) => void;
  label?: string;
  className?: string;
};

const DeadcoinVoteButton = dynamic(
  () => import('@/components/community/DeadcoinVoteButton'),
  { ssr: false }
) as React.ComponentType<DeadcoinVoteButtonProps>;

// ✅ client-safe local type:
type TokenCategory = 'healthy' | 'deadcoin' | 'unknown';

interface ConfirmModalProps {
  tokenSymbol: string;
  usdValue: number; // total USD (if you already computed), can be 0
  amount: number;   // token units (human)
  tokenCategory: TokenCategory | null;
  priceSources: { price: number; source: string }[];
  fetchStatus: 'loading' | 'found' | 'not_found' | 'error';
  isOpen: boolean;

  /** onConfirm can be sync or async */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  onDeadcoinVote: (vote: 'yes' | 'no') => void;

  /** Optional: for list status & vote button */
  tokenMint?: string;

  /** Optional: EVM hints */
  tokenContract?: string;     // e.g. 0x... (shows alongside)
  networkLabel?: string;      // e.g. 'Ethereum', 'Base', ...
  currentWallet?: string | null;

  /** Optional: external busy & label control */
  confirmBusy?: boolean;
  confirmLabel?: string;
}

type ListStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';

export default function ConfirmModal({
  tokenSymbol,
  usdValue,
  amount,
  tokenCategory,
  priceSources,
  fetchStatus,
  isOpen,
  onConfirm,
  onCancel,
  onDeadcoinVote,
  tokenMint,
  currentWallet,
  tokenContract,
  networkLabel,
  confirmBusy = false,
  confirmLabel,
}: ConfirmModalProps) {
  const [voteMessage, setVoteMessage] = useState('');
  const [listStatus, setListStatus] = useState<ListStatus | null>(null);
  const [statusAt, setStatusAt] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [internalBusy, setInternalBusy] = useState(false);
  const [votesYes, setVotesYes] = useState<number | null>(null);
  const [voteThreshold, setVoteThreshold] = useState<number | null>(null);
  const [statusVoteEligible, setStatusVoteEligible] = useState<boolean>(false);

  const busy = confirmBusy || internalBusy;

  // ✅ Safe USD derivation (unit price * amount)
  const firstUnit = useMemo(() => {
    const p =
      Array.isArray(priceSources) && priceSources[0]?.price
        ? Number(priceSources[0].price)
        : 0;
    return Number.isFinite(p) ? p : 0;
  }, [priceSources]);

  const derivedUsd = useMemo(() => {
    const total =
      usdValue > 0
        ? usdValue
        : firstUnit > 0
        ? firstUnit * Math.max(1, amount)
        : 0;
    return Number.isFinite(total) ? total : 0;
  }, [usdValue, firstUnit, amount]);

  // 🔒 Effective status resolver (UI single source of truth)
  function resolveEffectiveStatus() {
    if (listStatus === 'blacklist') return 'blacklist';
    if (listStatus === 'redlist') return 'redlist';
    if (listStatus === 'deadcoin') return 'deadcoin';
    if (listStatus === 'walking_dead') return 'walking_dead';

    if (
      fetchStatus !== 'loading' &&
      fetchStatus !== 'error' &&
      derivedUsd === 0
    ) {
      return 'deadcoin';
    }

    return 'healthy';
  }

  const effectiveStatus = useMemo(() => resolveEffectiveStatus(), [
    listStatus,
    fetchStatus,
    derivedUsd,
  ]);  

  // 🔎 Token list status (optional)
  useEffect(() => {
    let abort = false;
    async function load() {
      if (!isOpen || !tokenMint) return;
      try {
        setStatusLoading(true);
        const res = await fetch(
          `/api/status?mint=${encodeURIComponent(tokenMint)}&includeMetrics=1`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (abort) return;
  
        setListStatus(data.status as ListStatus);
        setStatusAt(data.statusAt ?? null);
        setVotesYes(
          typeof data.votesYes === 'number' ? data.votesYes : null
        );
        setVoteThreshold(
          typeof data.threshold === 'number' ? data.threshold : null
        );
        // 🔹 WD oylama bölgesi (wd_vote) bilgisi
        setStatusVoteEligible(!!data?.decision?.voteEligible);
      } catch {
        if (!abort) {
          setListStatus(null);
          setStatusAt(null);
          setStatusVoteEligible(false);
        }
      } finally {
        if (!abort) setStatusLoading(false);
      }
    }
    load();
    return () => {
      abort = true;
    };
  }, [isOpen, tokenMint]);  

  useEffect(() => {
    if (!isOpen) return;
    // light debug info
    console.debug('ConfirmModal props', {
      fetchStatus, usdValue, amount, priceSources,
      firstSource: Array.isArray(priceSources) ? priceSources[0] : null,
    });
  }, [isOpen, fetchStatus, usdValue, amount, priceSources]);

  const showDebug =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');

  // ✅ Rules: Black/Red list hard block; Deadcoin allowed
  const isHardBlocked =
  effectiveStatus === 'blacklist' || effectiveStatus === 'redlist';
  const isDeadcoin = effectiveStatus === 'deadcoin';

  // UI helpers
  const short = (s?: string | null) =>
    s && s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s ?? '';

  const renderListBanner = () => {
    if (statusLoading) return null;
    if (!listStatus) return null;

    const base = 'p-3 rounded font-medium text-white';
    if (listStatus === 'blacklist') {
      return (
        <div className={`bg-red-600 ${base}`}>
          ⛔ This token is on the <strong>Blacklist</strong>.
          {statusAt ? <> Since {new Date(statusAt).toLocaleString()}.</> : null}
          <div className="text-xs opacity-90">Coincarnation is blocked for blacklisted tokens.</div>
        </div>
      );
    }
    if (listStatus === 'redlist') {
      return (
        <div className={`bg-amber-600 ${base}`}>
          ⚠️ This token is on the <strong>Redlist</strong>.
          {statusAt ? <> Since {new Date(statusAt).toLocaleString()}.</> : null}
          <div className="text-xs opacity-90">Existing Coincarnations before listing remain valid.</div>
        </div>
      );
    }
    if (listStatus === 'deadcoin') {
      return (
        <div className={`bg-yellow-700 ${base}`}>
          ☠️ This token is classified as a <strong>Deadcoin</strong>.
          {statusAt ? <> Since {new Date(statusAt).toLocaleString()}.</> : null}
          <div className="text-xs opacity-90">
            Marked by the Coincarnation registry (admin / community decision).
          </div>
        </div>
      );
    }
    if (listStatus === 'walking_dead') {
      return (
        <div className={`bg-orange-700 ${base}`}>
          🧟 This token is on the <strong>Walking Deadcoin</strong> list.
          {statusAt ? <> Since {new Date(statusAt).toLocaleString()}.</> : null}
          <div className="text-xs opacity-90">It may turn into a Deadcoin; consider coincarnating sooner.</div>
        </div>
      );
    }
    return null;
  };

  async function handleConfirmClick() {
    try {
      const maybe = onConfirm?.();
      if (maybe && typeof (maybe as any).then === 'function') {
        setInternalBusy(true);
        await (maybe as Promise<void>);
      }
    } finally {
      setInternalBusy(false);
    }
  }

  const confirmBtnDisabled =
    busy || isHardBlocked || fetchStatus === 'loading' || fetchStatus === 'error';

  const effectiveConfirmLabel =
    confirmLabel ??
    (busy
      ? 'Processing…'
      : isDeadcoin
      ? 'Confirm Deadcoin Coincarnation'
      : `Confirm Coincarnation${amount ? ` (${amount} ${tokenSymbol})` : ''}`);

  const titleText =
  effectiveStatus === 'deadcoin'
    ? 'Confirm Deadcoin Coincarnation'
    : 'Confirm Coincarnation';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogOverlay />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-50 shadow-lg">
        <DialogTitle className="text-white">{titleText}</DialogTitle>
        <DialogDescription className="sr-only">
          Review value, status and confirm to proceed with coincarnation.
        </DialogDescription>

        {showDebug && (
          <div className="text-xs text-gray-300 bg-gray-900/60 rounded p-2 mt-2">
            <div>fetchStatus: <b>{fetchStatus}</b></div>
            <div>usdValue: <b>{String(usdValue)}</b></div>
            <div>derivedUsd: <b>{String(derivedUsd)}</b></div>
            <div>amount: <b>{String(amount)}</b></div>
            <div>priceSources: <b>{Array.isArray(priceSources) ? priceSources.length : 0}</b></div>
            {Array.isArray(priceSources) && priceSources[0] && (
              <>
                <div>first source: <b>{priceSources[0].source}</b> @ <b>{String(priceSources[0].price)}</b></div>
                <div>price typeof: <b>{typeof priceSources[0].price}</b></div>
              </>
            )}
            <div>listStatus: <b>{listStatus ?? '—'}</b></div>
            <div>isHardBlocked: <b>{String(isHardBlocked)}</b></div>
            <div>isDeadcoin: <b>{String(isDeadcoin)}</b></div>
          </div>
        )}

        <div className="mt-3 text-sm text-white space-y-1">
          <p>
            You are about to coincarnate <strong>{tokenSymbol}</strong> ({amount} units).
          </p>
          {isDeadcoin && (
            <p className="text-xs text-amber-200 mt-1">
              This asset is treated as a <strong>Deadcoin</strong> in Coincarnation.
              You will earn <strong>CorePoints</strong>, but{' '}
              <strong>no $MEGY will be distributed</strong> for this swap.
            </p>
          )}
          {(networkLabel || tokenContract || tokenMint) && (
            <div className="text-xs text-gray-300 space-y-0.5 mt-1">
              {networkLabel && <div>Network: <b>{networkLabel}</b></div>}
              {tokenContract && <div>Contract: <b title={tokenContract}>{short(tokenContract)}</b></div>}
              {tokenMint && <div>Mint: <b title={tokenMint}>{short(tokenMint)}</b></div>}
            </div>
          )}
        </div>

        <div className="space-y-3 text-sm text-white mt-4">
          {renderListBanner()}

          {/* 🔄 Fiyat yükleniyor */}
          {fetchStatus === 'loading' && (
            <div className="bg-blue-700 text-white p-3 rounded font-medium">
              🔄 Fetching price data... Please wait.
            </div>
          )}

          {/* ☠️ SADECE registry deadcoin DEĞİLSE ve sistem deadcoin diyorsa göster */}
          {isDeadcoin &&
            listStatus !== 'deadcoin' &&
            fetchStatus !== 'loading' &&
            fetchStatus !== 'error' && (
              <div className="bg-yellow-700 text-white p-3 rounded">
                ☠️ <strong>This token is treated as a Deadcoin.</strong>
                <br />
                CorePoint is granted; MEGY is not distributed,
                even if some historical price exists.
              </div>
            )}

          {/* ✅ SADECE healthy tokenlerde değer göster */}
          {fetchStatus === 'found' &&
            !isHardBlocked &&
            !isDeadcoin &&
            derivedUsd > 0 && (
              <div className="bg-green-700 text-white p-3 rounded font-medium">
                ✅ Estimated value: <strong>${derivedUsd.toString()}</strong>
              </div>
            )}

          {/* ✅ Fiyat kaynakları SADECE healthy ise göster */}
          {!isDeadcoin &&
            fetchStatus !== 'loading' &&
            fetchStatus !== 'error' &&
            Array.isArray(priceSources) &&
            priceSources.length > 0 && (
              <div>
                <p className="font-medium">Price Sources:</p>
                <ul className="list-disc list-inside">
                  {priceSources.map((src, i) => (
                    <li key={i}>
                      {src.source}: ${src.price.toString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* 🧟 Sadece walking_dead için oy alanı */}
          {listStatus === 'walking_dead' &&
            statusVoteEligible &&
            tokenMint &&
            fetchStatus === 'found' &&
            derivedUsd > 0 && (
              <div className="mt-2">
                <p className="text-xs text-orange-200 mb-2">
                  Community can vote this token as Deadcoin if liquidity/volume stays critically low.
                  <br />
                  <strong>{voteThreshold ?? 3} YES</strong> votes will mark it as Deadcoin.
                </p>

                {/* 🏷️ Votes rozet */}
                {typeof votesYes === 'number' && typeof voteThreshold === 'number' && (
                  <div className="inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-[11px] text-orange-100 mb-2">
                    <span>Community votes:</span>
                    <span className="font-semibold">
                      {votesYes} / {voteThreshold}
                    </span>
                    {votesYes < voteThreshold && (
                      <span className="opacity-80">
                        ({voteThreshold - votesYes} more to mark as Deadcoin)
                      </span>
                    )}
                  </div>
                )}

                <DeadcoinVoteButton
                  mint={tokenMint}
                  onVoted={(res) => {
                    onDeadcoinVote('yes');
                    if (res?.applied) setListStatus('deadcoin');

                    if (typeof res?.votesYes === 'number') {
                      setVotesYes(res.votesYes);
                    }
                    if (typeof res?.threshold === 'number') {
                      setVoteThreshold(res.threshold);
                    }

                    setVoteMessage(
                      res?.applied
                        ? '✅ Threshold reached – marked as Deadcoin.'
                        : `👍 Vote recorded (${res?.votesYes ?? 1}/${res?.threshold ?? 3})`
                    );
                  }}
                  label="Vote deadcoin (YES)"
                  className="w-full sm:w-auto"
                />
                {voteMessage && <div className="mt-2 text-xs text-gray-300">{voteMessage}</div>}
              </div>
            )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded bg-gray-500/70 px-4 py-2 font-semibold text-white transition hover:bg-gray-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmClick}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={confirmBtnDisabled}
          >
            {effectiveConfirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
