import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface PriceSource {
  price: number;
  source: string;
}

interface ConfirmModalProps {
    tokenSymbol: string;
    usdValue: number;
    sources: PriceSource[];
    onConfirm: () => void;
    onCancel: () => void;
    onDeadcoinVote: (vote: 'yes' | 'no') => void;
    open: boolean; // ✅ eksik olan buydu
  }  

export default function ConfirmModal({
  tokenSymbol,
  usdValue,
  sources,
  onConfirm,
  onCancel,
  onDeadcoinVote,
  open
}: ConfirmModalProps) {
  const [deadcoinVoted, setDeadcoinVoted] = useState(false);

  const handleDeadcoinVote = (vote: 'yes' | 'no') => {
    setDeadcoinVoted(true);
    onDeadcoinVote(vote);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogTitle>Confirm Coincarnation</DialogTitle>
      <DialogContent>
        <p>You are about to coincarnate <strong>{tokenSymbol}</strong>.</p>

        {usdValue === 0 ? (
          <div className="bg-yellow-100 text-yellow-800 p-2 rounded mt-3">
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
              <p className="mt-2 text-sm italic">Thank you, your vote has been recorded.</p>
            )}
          </div>
        ) : (
          <div className="bg-green-100 text-green-800 p-2 rounded mt-3">
            Estimated Value: <strong>${usdValue.toFixed(2)}</strong>
          </div>
        )}

        {sources.length > 0 && (
          <div className="mt-3">
            <h4 className="font-semibold mb-1">Price Sources:</h4>
            <ul className="list-disc list-inside text-sm">
              {sources.map((s, index) => (
                <li key={index}>
                  {s.source}: ${s.price}
                </li>
              ))}
            </ul>
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
