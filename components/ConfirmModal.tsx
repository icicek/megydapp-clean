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

async function readJsonSafe(res: Response) {
  const raw = await res.text();

  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    raw,
  };
}

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
  errorMessage?: string | null;
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
  errorMessage = null,
}: ConfirmModalProps) {
  const [voteMessage, setVoteMessage] = useState('');
  const [listStatus, setListStatus] = useState<ListStatus | null>(null);
  const [statusAt, setStatusAt] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusCheckedOnce, setStatusCheckedOnce] = useState(false);
  const [internalBusy, setInternalBusy] = useState(false);
  const [votesYes, setVotesYes] = useState<number | null>(null);
  const [voteThreshold, setVoteThreshold] = useState<number | null>(null);

  // 🔹 API decision detayları
  const [zone, setZone] = useState<'healthy' | 'wd_gray' | 'wd_vote' | 'deadzone' | null>(null);
  const [highLiq, setHighLiq] = useState(false);
  const [voteEligible, setVoteEligible] = useState(false);

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

    // Registry'de bilgi yok ama fiyat sıfır → fallback deadcoin
    if (
      fetchStatus !== 'loading' &&
      fetchStatus !== 'error' &&
      derivedUsd === 0
    ) {
      return 'deadcoin';
    }

    return 'healthy';
  }

  const effectiveStatus = useMemo(
    () => resolveEffectiveStatus(),
    [listStatus, fetchStatus, derivedUsd]
  );

  // 🔎 Token list status & decision
  useEffect(() => {
    let abort = false;
  
    async function load() {
      if (!isOpen) return;
  
      // Modal açıldığında önce eski state temizlensin
      setStatusCheckedOnce(false);
      setStatusLoading(Boolean(tokenMint));
      setListStatus(null);
      setStatusAt(null);
      setVotesYes(null);
      setVoteThreshold(null);
      setZone(null);
      setHighLiq(false);
      setVoteEligible(false);
      setVoteMessage('');
  
      // Mint yoksa status fetch yapamayız; ama block da etmeyelim
      if (!tokenMint) {
        setStatusLoading(false);
        setStatusCheckedOnce(true);
        return;
      }
  
      try {
        const url = `/api/status?mint=${encodeURIComponent(
          tokenMint
        )}&includeMetrics=1&_ts=${Date.now()}`;
  
        const res = await fetch(url, {
          cache: 'no-store',
        });
        
        const parsed = await readJsonSafe(res);
        
        if (!parsed.ok || !parsed.data) {
          throw new Error(
            `STATUS_NON_JSON_OR_HTTP_${parsed.status}: ${parsed.raw.slice(0, 120)}`
          );
        }
        
        const data = parsed.data;
        if (abort) return;
  
        const registryStatus = (data?.registry?.status ?? null) as ListStatus | null;
        const effStatus = (data?.status ?? null) as ListStatus | null;
  
        setListStatus(registryStatus ?? effStatus);
        setStatusAt(data?.statusAt ?? null);
  
        setVotesYes(typeof data?.votesYes === 'number' ? data.votesYes : null);
        setVoteThreshold(typeof data?.threshold === 'number' ? data.threshold : null);
  
        setZone(data?.decision?.zone ?? null);
        setHighLiq(Boolean(data?.decision?.highLiq));
        setVoteEligible(Boolean(data?.decision?.voteEligible));
      } catch (e) {
        if (!abort) {
          console.warn(
            '⚠️ /api/status failed in ConfirmModal:',
            (e as any)?.message || e
          );
          setListStatus(null);
          setStatusAt(null);
          setZone(null);
          setHighLiq(false);
          setVoteEligible(false);
        }
      } finally {
        if (!abort) {
          setStatusLoading(false);
          setStatusCheckedOnce(true);
        }
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
      fetchStatus,
      usdValue,
      amount,
      priceSources,
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
          <div className="text-xs opacity-90">
            Coincarnation is blocked for blacklisted tokens.
          </div>
        </div>
      );
    }
    if (listStatus === 'redlist') {
      return (
        <div className={`bg-amber-600 ${base}`}>
          ⚠️ This token is on the <strong>Redlist</strong>.
          {statusAt ? <> Since {new Date(statusAt).toLocaleString()}.</> : null}
          <div className="text-xs opacity-90">
            Existing Coincarnations before listing remain valid.
          </div>
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
          <div className="text-xs opacity-90">
            It may turn into a Deadcoin; consider coincarnating sooner.
          </div>
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
    busy ||
    statusLoading ||
    !statusCheckedOnce ||
    isHardBlocked ||
    fetchStatus === 'loading' ||
    fetchStatus === 'error' ||
    !!errorMessage;

  const effectiveConfirmLabel =
    confirmLabel ??
    (busy
      ? 'Processing…'
      : isDeadcoin
      ? 'Confirm Deadcoin Coincarnation'
      : `Confirm Coincarnation${
          amount ? ` (${amount} ${tokenSymbol})` : ''
        }`);

  const titleText =
    effectiveStatus === 'deadcoin'
      ? 'Confirm Deadcoin Coincarnation'
      : 'Confirm Coincarnation';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogOverlay />
      <DialogContent
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-50 shadow-lg"
      >
        <DialogTitle className="text-white">{titleText}</DialogTitle>
        {errorMessage && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
            <div className="font-semibold mb-1">Could not continue</div>
            <div className="text-xs opacity-90">{errorMessage}</div>
          </div>
        )}
        <DialogDescription className="sr-only">
          Review value, status and confirm to proceed with coincarnation.
        </DialogDescription>

        {showDebug && (
          <div className="text-xs text-gray-300 bg-gray-900/60 rounded p-2 mt-2">
            <div>fetchStatus: <b>{fetchStatus}</b></div>
            <div>usdValue: <b>{String(usdValue)}</b></div>
            <div>derivedUsd: <b>{String(derivedUsd)}</b></div>
            <div>amount: <b>{String(amount)}</b></div>
            <div>
              priceSources:{' '}
              <b>{Array.isArray(priceSources) ? priceSources.length : 0}</b>
            </div>
            {Array.isArray(priceSources) && priceSources[0] && (
              <>
                <div>
                  first source:{' '}
                  <b>{priceSources[0].source}</b> @{' '}
                  <b>{String(priceSources[0].price)}</b>
                </div>
                <div>
                  price typeof:{' '}
                  <b>{typeof priceSources[0].price}</b>
                </div>
              </>
            )}
            <div>listStatus: <b>{listStatus ?? '—'}</b></div>
            <div>zone: <b>{zone ?? '—'}</b></div>
            <div>highLiq: <b>{String(highLiq)}</b></div>
            <div>voteEligible: <b>{String(voteEligible)}</b></div>
            <div>isHardBlocked: <b>{String(isHardBlocked)}</b></div>
            <div>isDeadcoin: <b>{String(isDeadcoin)}</b></div>
          </div>
        )}

        <div className="mt-3 text-sm text-white space-y-1">
          <p>
            You are about to coincarnate <strong>{tokenSymbol}</strong> ({amount}{' '}
            units).
          </p>
          {isDeadcoin && (
            <p className="text-xs text-amber-200 mt-1">
              This asset is treated as a <strong>Deadcoin</strong> in
              Coincarnation. You will earn <strong>CorePoints</strong>, but{' '}
              <strong>no $MEGY will be distributed</strong> for this swap.
            </p>
          )}
          {(networkLabel || tokenContract || tokenMint || currentWallet) && (
            <div className="text-xs text-gray-300 space-y-0.5 mt-1">
              {networkLabel && (
                <div>
                  Network: <b>{networkLabel}</b>
                </div>
              )}
              {currentWallet && (
                <div>
                  From wallet:{' '}
                  <b title={currentWallet}>{short(currentWallet)}</b>
                </div>
              )}
              {tokenContract && (
                <div>
                  Contract:{' '}
                  <b title={tokenContract}>{short(tokenContract)}</b>
                </div>
              )}
              {tokenMint && (
                <div>
                  Mint:{' '}
                  <b title={tokenMint}>{short(tokenMint)}</b>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 text-sm text-white mt-4">
          {statusLoading && (
            <div className="bg-blue-700 text-white p-3 rounded font-medium">
              🔄 Checking latest token status...
            </div>
          )}
          
          {renderListBanner()}

          {/* 🔄 Fiyat yükleniyor */}
          {fetchStatus === 'loading' && (
            <div className="bg-blue-700 text-white p-3 rounded font-medium">
              🔄 Fetching price data... Please wait.
            </div>
          )}

          {/* ☠️ Registry'de deadcoin değil ama sistem deadcoin diyorsa açıklama */}
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

          {/* ✅ Değer bulduysak HER durumda (hard block değilse) göster */}
          {fetchStatus === 'found' &&
            !isHardBlocked &&
            derivedUsd > 0 && (
              <div className="bg-green-700 text-white p-3 rounded font-medium">
                ✅ Estimated value:{' '}
                <strong>${derivedUsd.toString()}</strong>
                {isDeadcoin && (
                  <div className="text-xs mt-1 opacity-80">
                    This value is shown for transparency only; deadcoin
                    Coincarnations do not receive $MEGY.
                  </div>
                )}
              </div>
            )}

          {/* ✅ Fiyat kaynaklarını da şeffaflık için her durumda göster (hard block hariç) */}
          {!isHardBlocked &&
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

          {/* 🧟 Deadcoin oylaması: sadece backend voteEligible ise */}
          {voteEligible && listStatus === 'walking_dead' && tokenMint && (
            <div className="mt-2">
              <p className="text-xs text-orange-200 mb-2">
                Community can vote this token as Deadcoin if liquidity/volume
                stays critically low.
                <br />
                <strong>{voteThreshold ?? 3} YES</strong> votes will mark it as
                Deadcoin.
              </p>

              {typeof votesYes === 'number' &&
                typeof voteThreshold === 'number' && (
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
                      : `👍 Vote recorded (${res?.votesYes ?? 1}/${
                          res?.threshold ?? 3
                        })`
                  );
                }}
                label="Vote deadcoin (YES)"
                className="w-full sm:w-auto"
              />
              {voteMessage && (
                <div className="mt-2 text-xs text-gray-300">
                  {voteMessage}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              onCancel();
            }}
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
