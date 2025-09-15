// components/ConfirmModal.tsx
'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { TokenCategory } from '@/app/api/utils/classifyToken';
import DeadcoinVoteButton from '@/components/community/DeadcoinVoteButton';

interface ConfirmModalProps {
  tokenSymbol: string;
  usdValue: number;
  amount: number;
  tokenCategory: TokenCategory | null;
  priceSources: { price: number; source: string }[];
  fetchStatus: 'loading' | 'found' | 'not_found' | 'error';
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDeadcoinVote: (vote: 'yes' | 'no') => void;

  // ✅ Opsiyonel: list status & oy butonu için gerekli
  tokenMint?: string;
  currentWallet?: string | null;
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
}: ConfirmModalProps) {
  const [voteMessage, setVoteMessage] = useState('');
  const [listStatus, setListStatus] = useState<ListStatus | null>(null);
  const [statusAt, setStatusAt] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // 🔎 Opsiyonel: tokenMint sağlanırsa liste durumunu çek
  useEffect(() => {
    let abort = false;
    async function load() {
      if (!isOpen || !tokenMint) return;
      try {
        setStatusLoading(true);
        const res = await fetch(`/api/status?mint=${encodeURIComponent(tokenMint)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (abort) return;
        setListStatus(data.status as ListStatus);
        setStatusAt(data.statusAt ?? null);
      } catch {
        if (!abort) {
          setListStatus(null);
          setStatusAt(null);
        }
      } finally {
        if (!abort) setStatusLoading(false);
      }
    }
    load();
    return () => { abort = true; };
  }, [isOpen, tokenMint]);

  useEffect(() => {
    if (!isOpen) return;
    console.debug('ConfirmModal props', {
      fetchStatus, usdValue, amount, priceSources,
      firstSource: priceSources?.[0] ?? null,
    });
  }, [isOpen, fetchStatus, usdValue, amount, priceSources]);

  // Debug paneli URL parametresi ile aç/kapat
  const showDebug =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');

  // ✅ Güvenli USD (birim fiyat * amount)
  const firstUnit = Array.isArray(priceSources) && priceSources[0]?.price ? Number(priceSources[0].price) : 0;
  const derivedUsd = usdValue > 0 ? usdValue : (firstUnit > 0 ? firstUnit * Math.max(1, amount) : 0);

  // ✅ Kurallar: Blacklist/Redlist → sert engel; Deadcoin → izin ver
  const isHardBlocked = listStatus === 'blacklist' || listStatus === 'redlist';
  const isDeadcoin =
    listStatus === 'deadcoin' ||
    fetchStatus === 'not_found' ||
    (fetchStatus === 'found' && derivedUsd === 0);

  // 💬 Liste durumu için üstte ince uyarı bandı
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
          <div className="text-xs opacity-90">CorePoint is granted; MEGY is not distributed.</div>
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      {/* Overlay ekledik */}
      <DialogOverlay />

      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-50 shadow-lg">
        {/* Radix için gerçek Title + Description (Title görünür, Description gizli de olabilir) */}
        <DialogTitle className="text-white">Confirm Coincarnation</DialogTitle>
        <DialogDescription className="sr-only">
          Review value, status and confirm to proceed with coincarnation.
        </DialogDescription>

        {showDebug && (
          <div className="text-xs text-gray-300 bg-gray-900/60 rounded p-2 mt-2">
            <div>fetchStatus: <b>{fetchStatus}</b></div>
            <div>
              usdValue: <b>{String(usdValue)}</b>{" "}
              <span>(typeof: <b>{typeof usdValue}</b>)</span>
            </div>
            <div>derivedUsd: <b>{String(derivedUsd)}</b></div>
            <div>amount: <b>{String(amount)}</b></div>
            <div>priceSources: <b>{Array.isArray(priceSources) ? priceSources.length : 0}</b></div>
            {Array.isArray(priceSources) && priceSources[0] && (
              <>
                <div>
                  first source: <b>{priceSources[0].source}</b> @ <b>{String(priceSources[0].price)}</b>
                </div>
                <div>price typeof: <b>{typeof priceSources[0].price}</b></div>
              </>
            )}
            <div>listStatus: <b>{listStatus ?? '—'}</b></div>
            <div>isHardBlocked: <b>{String(isHardBlocked)}</b></div>
            <div>isDeadcoin: <b>{String(isDeadcoin)}</b></div>
          </div>
        )}

        <div className="mt-3 text-sm text-white">
          <p>
            You are about to coincarnate <strong>{tokenSymbol}</strong> ({amount} units).
          </p>
        </div>

        <div className="space-y-3 text-sm text-white mt-4">
          {/* 🔔 Liste durumu (opsiyonel) */}
          {renderListBanner()}

          {fetchStatus === 'loading' && (
            <div className="bg-blue-700 text-white p-3 rounded font-medium">
              🔄 Fetching price data... Please wait.
            </div>
          )}

          {/* ☠️ Deadcoin mesajı */}
          {(isDeadcoin && (fetchStatus === 'found' || fetchStatus === 'not_found')) && (
            <div className="bg-yellow-700 text-white p-3 rounded">
              ☠️ <strong>This token is treated as a Deadcoin.</strong><br />
              CorePoint is granted; MEGY is not distributed.
            </div>
          )}

          {/* ✅ Değer bulundu (ve engel yok) */}
          {fetchStatus === 'found' && !isHardBlocked && derivedUsd > 0 && (
            <div className="bg-green-700 text-white p-3 rounded font-medium">
              ✅ Estimated value: <strong>${derivedUsd.toString()}</strong>
            </div>
          )}

          {/* Kaynak listesi */}
          {(fetchStatus === 'found' || fetchStatus === 'not_found') && priceSources.length > 0 && (
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

          {/* 🗳️ Oy butonu */}
          {listStatus === 'walking_dead' && tokenMint && fetchStatus === 'found' && derivedUsd > 0 && (
            <div className="mt-2">
              <p className="text-xs text-orange-200 mb-2">
                Community can vote this token as Deadcoin if liquidity/volume stays critically low.
                <br />
                <strong>3 YES</strong> votes will mark it as Deadcoin.
              </p>
              <DeadcoinVoteButton
                mint={tokenMint}
                onVoted={(res) => {
                  onDeadcoinVote('yes');
                  if (res?.applied) {
                    setListStatus('deadcoin');
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
            onClick={onCancel}
            className="bg-gray-400 text-black px-4 py-2 rounded"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-blue-600 text-white px-4 py-2 rounded"
            disabled={isHardBlocked || fetchStatus === 'loading' || fetchStatus === 'error'}
          >
            Confirm Coincarnation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
