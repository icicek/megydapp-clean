'use client';

import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface CoincarneModalProps {
  onClose: () => void;
}

export default function CoincarneModal({ onClose }: CoincarneModalProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-black text-white rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">🔥 Coincarnate Your Token</h2>
        <p className="text-sm text-gray-400 mb-6">
          Here you will select a token and send it to Coincarnate. This is a placeholder modal.
        </p>

        <button
          className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-md text-white"
          onClick={onClose}
        >
          Close
        </button>
      </DialogContent>
    </Dialog>
  );
}
