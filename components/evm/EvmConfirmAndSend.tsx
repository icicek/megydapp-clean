'use client';
import React, { useMemo, useState } from 'react';
import useChainWalletEvm from '@/hooks/useChainWalletEvm';
import useEvmCoincarnation from '@/hooks/useEvmCoincarnation';

export default function EvmConfirmAndSend({
  selectedToken, // from your dropdown { isNative, symbol, decimals, contract? }
  amount,        // string
  usdValue,      // number (from getUsdValue)
  onSuccess,     // (hash:string) => void
  onError,       // (err:string) => void
}: {
  selectedToken: { isNative: boolean; symbol: string; decimals: number; contract?: `0x${string}`; name?: string };
  amount: string;
  usdValue: number;
  onSuccess?: (hash: string) => void;
  onError?: (err: string) => void;
}) {
  const evm = useChainWalletEvm();
  const coin = useEvmCoincarnation({
    chain: evm.chain,
    account: (evm.account as any) ?? undefined,
    walletClient: evm.walletClient,
    publicClient: evm.publicClient,
  });

  const [busy, setBusy] = useState(false);

  const canSend = useMemo(
    () => evm.isConnected && amount && Number(amount) > 0 && !!selectedToken,
    [evm.isConnected, amount, selectedToken]
  );

  async function handleConfirm() {
    try {
      setBusy(true);
      const { hash } = await coin.run({
        token: selectedToken,
        amount,
        usdValue,
      });
      onSuccess?.(hash);
    } catch (e: any) {
      onError?.(e?.message || 'Failed to send transaction');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <div>Account: {evm.account || '—'}</div>
        <div>Chain: {evm.chain.name}</div>
      </div>
      <button
        disabled={!canSend || busy}
        onClick={handleConfirm}
        className="w-full rounded px-4 py-2 bg-indigo-600 text-white disabled:opacity-50"
      >
        {busy ? 'Sending…' : `Confirm & Send ${amount} ${selectedToken.symbol}`}
      </button>
      {coin.txHash && <div className="text-xs break-all">tx: {coin.txHash}</div>}
      {coin.phase !== 'idle' && <div className="text-xs opacity-70">phase: {coin.phase}</div>}
    </div>
  );
}
