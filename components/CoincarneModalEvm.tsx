// /components/CoincarneModalEvm.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { Address, Chain } from 'viem';
import { Dialog, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ConfirmModalAdapterEvm from '@/components/evm/ConfirmModalAdapterEvm';

type TokenLike = {
  isNative: boolean;
  symbol: string;
  decimals: number;
  contract?: `0x${string}`;
  name?: string;
};

export default function CoincarneModalEvm({
  token,
  chain,
  account,
  walletClient,
  publicClient,
  onClose,
  onGoToProfileRequest,
}: {
  token: TokenLike;
  chain: Chain;
  account: Address;
  walletClient: any;
  publicClient: any;
  onClose: () => void;
  onGoToProfileRequest?: () => void;
}) {
  const [amount, setAmount] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);

  const canReview = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0;
  }, [amount]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogOverlay />
      <DialogContent className="bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-50 shadow-lg">
        <DialogTitle className="text-white">🔥 Coincarnate (EVM) — {chain.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Choose amount and continue to review and confirm coincarnation.
        </DialogDescription>

        <div className="mt-3 text-sm">
          <div className="text-gray-300">Token</div>
          <div className="font-semibold">
            {token.symbol}{' '}
            {token.contract
              ? <span className="text-xs opacity-70">({token.contract.slice(0,6)}…{token.contract.slice(-4)})</span>
              : <span className="text-xs opacity-70">(native)</span>}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm text-gray-300">Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="mt-1 w-full bg-gray-800 text-white p-3 rounded border border-gray-600"
            inputMode="decimal"
          />
          <p className="text-xs text-gray-400 mt-2">
            You will review final USD estimation and list status in the next step.
          </p>
        </div>

        <div className="flex justify-between items-center mt-6">
          <button onClick={onClose} className="bg-gray-400 text-black px-4 py-2 rounded">Cancel</button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canReview}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded"
          >
            Review
          </button>
        </div>
      </DialogContent>

      {showConfirm && (
        <ConfirmModalAdapterEvm
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          chain={chain}
          account={account}
          walletClient={walletClient}
          publicClient={publicClient}
          token={token}
          amount={amount}
          waitForReceipt={true}
          onSuccess={() => {
            setShowConfirm(false);
            onClose();
            onGoToProfileRequest?.();
          }}
        />
      )}
    </Dialog>
  );
}
