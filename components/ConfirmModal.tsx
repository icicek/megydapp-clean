'use client';

import React, { useState } from 'react';
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
  tokenMint?: string;
}

// 💲 Küçük değerleri 0 yapmadan gösteren formatlayıcı
function formatUsd(v: number): string {
  if (!isFinite(v) || v === 0) return '$0';
  if (Math.abs(v) >= 0.01) {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (Math.abs(v) >= 1e-6) {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
  }
  // aşırı küçükler bilimsel gösterim
  return `$${v.toExponential(2)}`;
}

// Tekil fiyat (kaynak) için: 1$ üzeri 4 hane, altı 8 hane
function formatUnitPrice(p: number): string {
  if (!isFinite(p) || p === 0) return '$0';
  if (Math.abs(p) >= 1) {
    return `$${p.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  }
  if (Math.abs(p) >= 1e-6) {
    return `$${p.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })}`;
  }
  return `$${p.toExponential(2)}`;
}

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
  tokenMint
}: ConfirmModalProps) {
  const [deadcoinVoted, setDeadcoinVoted] = useState(false);
  const [voteMessage, setVoteMessage] = useState('');

  const handleDeadcoinVote = async (vote: 'yes' | 'no') => {
    setDeadcoinVoted(true);
    onDeadcoinVote(vote);

    try {
      if (tokenMint) {
        const res = await fetch('/api/list/deadcoin/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint: tokenMint, vote })
        });

        const data = await res.json();
        if (data.isDeadcoin) {
          setVoteMessage('💀 This token is now in the Deadcoin List!');
        } else {
          setVoteMessage('✅ Thank you! Your vote has been recorded.');
        }
      } else {
        setVoteMessage('✅ Thank you! Your vote has been recorded.');
      }
    } catch (err) {
      console.error('❌ Error voting deadcoin:', err);
      setVoteMessage('⚠️ Failed to record your vote. Please try again.');
    }
  };

  // Kategori uyarıları (renkler korunuyor)
  const renderCategoryNotice = () => {
    switch (tokenCategory) {
      case 'blacklist':
        return (
          <div className="bg-black text-white p-3 rounded font-medium">
            ⛔ <strong>This token is on the BLACKLIST.</strong><br />
            You cannot coincarnate this token. All MEGY claims are permanently blocked.
          </div>
        );
      case 'redlist':
        return (
          <div className="bg-red-200 text-red-900 p-3 rounded font-medium">
            ⚠️ <strong>This token is on the REDLIST.</strong><br />
            You can coincarnate it if you owned it before its redlist date, but MEGY claims may be restricted.
          </div>
        );
      case 'walking_dead':
        return (
          <div className="bg-yellow-100 text-yellow-800 p-3 rounded font-medium">
            ⚠️ This token is a <strong>Walking Deadcoin</strong>.<br />
            Liquidity and volume are critically low. It may soon become a Deadcoin.
          </div>
        );
      case 'deadcoin':
        return (
          <div className="bg-gray-200 text-gray-800 p-3 rounded font-medium">
            💀 This is a <strong>Deadcoin</strong>.<br />
            You can coincarnate it and earn CorePoints, but it will not generate MEGY.
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
                  className="bg-gray-300 text-gray-800 px-3 py-1 rounded"
                >
                  No, it is not
                </button>
              </div>
            )}
            {deadcoinVoted && (
              <div className="mt-3 p-2 bg-green-100 text-green-800 rounded font-semibold text-center">
                {voteMessage}
              </div>
            )}
          </div>
        );
      case 'healthy':
        return (
          <div className="bg-green-100 text-green-800 p-3 rounded font-medium">
            ✅ This token is Healthy. Full MEGY rewards apply.
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="bg-zinc-900 text-white"> {/* 🔥 modal zemini koyu, metinler beyaz */}
        <DialogTitle className="text-white">Confirm Coincarnation</DialogTitle>

        <div className="mt-3 text-sm text-white"> {/* 👈 net beyaz */}
          <p>
            You are about to coincarnate <strong>{tokenSymbol}</strong> ({amount} units).
          </p>
        </div>

        <div className="space-y-3 text-sm mt-4">
          {/* Kategoriye göre uyarı */}
          {renderCategoryNotice()}

          {/* Fiyat bilgisi */}
          {fetchStatus === 'found' && (
            <div className="bg-zinc-800 text-white p-3 rounded font-medium">
              💲 Estimated value: <strong>{formatUsd(usdValue)}</strong>
            </div>
          )}

          {/* Fiyat kaynakları */}
          {fetchStatus === 'found' && priceSources.length > 0 && (
            <div className="text-white"> {/* 👈 başlık & liste beyaz */}
              <p className="font-medium">Price Sources:</p>
              <ul className="list-disc list-inside">
                {priceSources.map((src, i) => (
                  <li key={i}>
                    {src.source}: {formatUnitPrice(src.price)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Hata / bulunamadı */}
          {fetchStatus === 'not_found' && (
            <div className="bg-red-600/20 text-red-300 p-3 rounded font-medium">
              ❌ Failed to fetch price from all sources. Please try again later.
            </div>
          )}
          {fetchStatus === 'loading' && (
            <div className="bg-blue-600/20 text-blue-200 p-3 rounded font-medium">
              🔄 Fetching price data... Please wait.
            </div>
          )}
          {fetchStatus === 'error' && (
            <div className="bg-red-600/20 text-red-200 p-3 rounded font-medium">
              ⚠️ An error occurred while fetching price.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded"
            disabled={fetchStatus !== 'found' || tokenCategory === 'blacklist'}
          >
            Confirm Coincarnation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
