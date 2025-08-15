'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TokenCategory } from '@/app/api/utils/classifyToken';

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

  // ✅ Yeni ama opsiyonel: vermezsen eski davranış korunur
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
  const [deadcoinVoted, setDeadcoinVoted] = useState(false);
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
        const res = await fetch(`/api/list/status?mint=${encodeURIComponent(tokenMint)}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (abort) return;
        setListStatus(data.status as ListStatus);
        setStatusAt(data.statusAt ?? null);
      } catch (e) {
        // Sessiz geç – UI akışı bozulmasın
        if (!abort) {
          setListStatus(null);
          setStatusAt(null);
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

  const handleDeadcoinVote = async (vote: 'yes' | 'no') => {
    setDeadcoinVoted(true);
    onDeadcoinVote(vote); // 🔁 mevcut callback korunuyor
    setVoteMessage('✅ Thank you! Your vote has been recorded.');

    // Backend’e kaydet (opsiyonel, parametreler yoksa atla)
    if (!tokenMint || !currentWallet) return;
    try {
      await fetch('/api/list/deadcoin/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: tokenMint,
          vote, // 'yes' | 'no' — backend bu formatı destekliyor
          voter_wallet: currentWallet,
        }),
      });
    } catch {
      // Sessiz geç – kullanıcı deneyimini bozma
    }
  };

  // 💬 Liste durumu için üstte ince uyarı bandı
  const renderListBanner = () => {
    if (!listStatus || statusLoading) return null;

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
      <DialogContent>
        <DialogTitle className="text-white">Confirm Coincarnation</DialogTitle>

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

          {fetchStatus === 'not_found' && (
            <div className="bg-red-700 text-white p-3 rounded font-medium">
              ❌ Failed to fetch price from all sources. Please try again later.
            </div>
          )}

          {fetchStatus === 'found' && usdValue === 0 && (
            <div className="bg-yellow-700 text-white p-3 rounded">
              ⚠️ <strong>This token has no detectable USD value.</strong><br />
              Do you confirm this as a deadcoin?
              {!deadcoinVoted && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleDeadcoinVote('yes')}
                    className="bg-red-600 text-white px-3 py-1 rounded"
                  >
                    Yes, it is a Deadcoin
                  </button>
                  <button
                    onClick={() => handleDeadcoinVote('no')}
                    className="bg-gray-400 text-black px-3 py-1 rounded"
                  >
                    No, it is not
                  </button>
                </div>
              )}
              {deadcoinVoted && (
                <div className="mt-3 p-2 bg-green-700 text-white rounded font-semibold text-center">
                  {voteMessage}
                </div>
              )}
            </div>
          )}

          {fetchStatus === 'found' && usdValue > 0 && (
            <div className="bg-green-700 text-white p-3 rounded font-medium">
              ✅ This token has estimated value: <strong>${usdValue.toString()}</strong>
            </div>
          )}

          {fetchStatus === 'found' && priceSources.length > 0 && (
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
            disabled={fetchStatus !== 'found' || listStatus === 'blacklist'}
          >
            Confirm Coincarnation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
