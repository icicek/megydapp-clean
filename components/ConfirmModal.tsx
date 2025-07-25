import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TokenCategory } from '@/app/api/utils/classifyToken'; // Bu gerekli

interface PriceSource {
  price: number;
  source: string;
}

interface ConfirmModalProps {
  tokenSymbol: string;
  usdValue: number;
  amount: number;
  tokenCategory: TokenCategory | null;
  priceSources: { price: number; source: string }[];
  sources?: { price: number; source: string }[]; // Optional olabilir
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDeadcoinVote: (vote: 'yes' | 'no') => void;
}

export default function ConfirmModal({
  tokenSymbol,
  usdValue,
  amount,
  tokenCategory,
  priceSources,
  isOpen,
  onConfirm,
  onCancel,
  onDeadcoinVote,
}: ConfirmModalProps) {
  const [deadcoinVoted, setDeadcoinVoted] = useState(false);
  const [voteMessage, setVoteMessage] = useState('');

  const handleDeadcoinVote = (vote: 'yes' | 'no') => {
    setDeadcoinVoted(true);
    onDeadcoinVote(vote);
    setVoteMessage('✅ Thank you! Your vote has been recorded.');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogTitle>Confirm Coincarnation</DialogTitle>

        <p className="text-sm text-gray-700 mb-2">
          You are about to coincarnate <strong>{tokenSymbol}</strong> ({amount} units).
        </p>

        <div className="space-y-2 text-sm text-gray-700 mb-4">
          <p>Total USD Value: <strong>${usdValue.toFixed(2)}</strong></p>
          <p>Category: <strong>{tokenCategory || 'Unknown'}</strong></p>
          {priceSources.length > 0 && (
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

        {usdValue === 0 ? (
          <div className="bg-yellow-100 text-yellow-800 p-2 rounded mb-3">
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
        ) : (
          <div className="bg-green-100 text-green-800 p-2 rounded mb-3">
            ✅ This token has estimated value.
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="bg-gray-300 text-gray-800 px-4 py-2 rounded"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Confirm Coincarnation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
