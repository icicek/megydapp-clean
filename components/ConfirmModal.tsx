import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface ConfirmModalProps {
  open: boolean;
  tokenSymbol: string;
  amount: number;
  usdValue: number;
  priceSources: string[];
  tokenStatus: 'whitelist' | 'blacklist' | 'redlist' | 'deadcoin' | 'unknown';
  redlistDate?: string; // ISO date string
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  tokenSymbol,
  amount,
  usdValue,
  priceSources,
  tokenStatus,
  redlistDate,
  onConfirm,
  onCancel
}: ConfirmModalProps) {

  const renderContent = () => {
    switch (tokenStatus) {
      case 'blacklist':
        return (
          <>
            <p className="text-red-400 font-bold mb-4">
              ❌ This token is blacklisted and cannot be Coincarnated.
            </p>
          </>
        );

      case 'redlist':
        return (
          <>
            <p className="text-yellow-400 font-bold mb-4">
              ⚠️ This token was added to the redlist on <strong>{formatDate(redlistDate)}</strong>. Coincarnation is no longer allowed.
            </p>
          </>
        );

      case 'deadcoin':
        return (
          <>
            <p className="text-pink-400 mb-4">
              ☠️ This token is marked as a deadcoin. Proceed to revive it into global synergy!
            </p>
            <p>You are about to Coincarne:</p>
            <p><strong>{amount} {tokenSymbol}</strong> for <strong>${usdValue.toFixed(4)}</strong></p>
          </>
        );

      case 'unknown':
        return (
          <>
            <p className="text-gray-300 mb-4">
              ❓ We could not determine a price for this token.
            </p>
            <p>
              Do you confirm that <strong>{tokenSymbol}</strong> is a deadcoin?
              This helps our system classify it better for others.
            </p>
          </>
        );

      case 'whitelist':
      default:
        return (
          <>
            <p className="text-green-400 mb-4">
              ✅ Price sources detected: <strong>{priceSources.join(', ')}</strong>
            </p>
            <p>
              You are about to Coincarne <strong>{amount} {tokenSymbol}</strong>, worth approximately <strong>${usdValue.toFixed(4)}</strong>.
            </p>
          </>
        );
    }
  };

  const isConfirmDisabled =
    tokenStatus === 'blacklist' || tokenStatus === 'redlist';

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
      <DialogContent
        className="z-50 bg-zinc-900 text-white rounded-xl p-6 max-w-md w-full border border-pink-500/30"
      >
        <DialogTitle className="text-xl font-bold mb-4">Confirm Coincarnation</DialogTitle>
        {renderContent()}

        <div className="mt-6 flex justify-end space-x-2">
          <button
            onClick={onCancel}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Cancel
          </button>

          {!isConfirmDisabled && (
            <button
              onClick={onConfirm}
              className="bg-green-500 hover:bg-green-600 text-black font-bold px-4 py-2 rounded-lg text-sm"
            >
              {tokenStatus === 'unknown' ? 'Confirm as Deadcoin' : 'Confirm & Coincarne Now'}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Basit tarih format fonksiyonu
function formatDate(isoDate?: string): string {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString();
}
