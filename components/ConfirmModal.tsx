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
  tokenMint?: string; // 🔹 Mint adresi ekledik
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogTitle>Confirm Coincarnation</DialogTitle>

        <div className="mt-3 text-sm text-gray-700">
          <p>
            You are about to coincarnate <strong>{tokenSymbol}</strong> ({amount} units).
          </p>
        </div>

        <div className="space-y-3 text-sm text-gray-700 mt-4">
          {fetchStatus === 'loading' && (
            <div className="bg-blue-100 text-blue-800 p-3 rounded font-medium">
              🔄 Fetching price data... Please wait.
            </div>
          )}

          {fetchStatus === 'not_found' && (
            <div className="bg-red-100 text-red-800 p-3 rounded font-medium">
              ❌ Failed to fetch price from all sources. Please try again later.
            </div>
          )}

          {fetchStatus === 'found' && usdValue === 0 && (
            <div className="bg-yellow-100 text-yellow-800 p-3 rounded">
              ⚠️ <strong>This token has no USD value.</strong><br />
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
          )}

          {fetchStatus === 'found' && usdValue > 0 && (
            <div className="bg-green-100 text-green-800 p-3 rounded font-medium">
              ✅ This token has estimated value: <strong>${usdValue.toFixed(2)}</strong>
            </div>
          )}

          {fetchStatus === 'found' && priceSources.length > 0 && (
            <div>
              <p className="font-medium">Price Sources:</p>
              <ul className="list-disc list-inside">
                {priceSources.map((src, i) => (
                  <li key={i}>
                    {src.source}: ${src.price.toFixed(4)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="bg-gray-300 text-gray-800 px-4 py-2 rounded"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-blue-600 text-white px-4 py-2 rounded"
            disabled={fetchStatus !== 'found'}
          >
            Confirm Coincarnation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
