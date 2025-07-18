'use client';

import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface ConfirmModalProps {
  open: boolean;
  tokenSymbol: string;
  amount: number;
  usdValue: number;
  priceSources: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  tokenSymbol,
  amount,
  usdValue,
  priceSources,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
      <DialogContent className="z-50 bg-zinc-900 text-white rounded-2xl p-6 max-w-md w-full border border-pink-500/30 shadow-lg">
        <DialogTitle className="text-lg font-bold mb-4 text-center">
          Confirm Coincarnation
        </DialogTitle>

        <p className="text-center mb-2">
          You are about to Coincarne:
        </p>
        <p className="text-center text-xl font-bold mb-2">
          {amount} {tokenSymbol}
        </p>
        <p className="text-center text-sm text-gray-300 mb-2">
          Estimated USD Value: <strong>${usdValue.toFixed(4)}</strong>
        </p>
        <p className="text-center text-sm text-gray-400 mb-4">
          Price Source: {priceSources.join(' + ')}
        </p>

        <div className="flex gap-3 mt-4">
          <button
            onClick={onConfirm}
            className="flex-1 bg-green-500 hover:bg-green-600 text-black font-bold py-2 rounded-lg"
          >
            Confirm & Coincarne Now
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
