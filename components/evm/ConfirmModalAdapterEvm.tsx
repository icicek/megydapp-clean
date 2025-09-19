'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Address, Chain } from 'viem';
import ConfirmModal from '@/components/ConfirmModal';
import useEvmCoincarnation from '@/hooks/useEvmCoincarnation';
import { fetchErc20UnitPrice, fetchNativeUnitPrice } from '@/lib/pricing/client';
import { formatAgo } from '@/lib/time/ago';

type TokenLike = {
  isNative: boolean;
  symbol: string;
  decimals: number;
  contract?: `0x${string}`;
  name?: string;
};

export default function ConfirmModalAdapterEvm({
  isOpen,
  onClose,
  chain,
  account,
  walletClient,
  publicClient,
  token,
  amount,                     // string (human)
  onSuccess,
  waitForReceipt = false,     // NEW: bubbles to hook
}: {
  isOpen: boolean;
  onClose: () => void;
  chain: Chain;
  account: Address;
  walletClient: any;
  publicClient: any;
  token: TokenLike;
  amount: string;
  onSuccess?: (hash: string) => void;
  waitForReceipt?: boolean;
}) {
  const coin = useEvmCoincarnation({ chain, account, walletClient, publicClient });

  const [priceSources, setPriceSources] = useState<{ price: number; source: string }[]>([]);
  const [usdValue, setUsdValue] = useState<number>(0);
  const [fetchStatus, setFetchStatus] = useState<'loading' | 'found' | 'not_found' | 'error'>('loading');

  // Modal açılınca fiyat + kaynakları yükle
  useEffect(() => {
    let abort = false;
    async function load() {
      if (!isOpen) return;
      setFetchStatus('loading');
      try {
        const amt = Number(amount || 0);
        if (!Number.isFinite(amt) || amt <= 0) {
          setUsdValue(0);
          setPriceSources([]);
          setFetchStatus('not_found');
          return;
        }

        if (token.isNative) {
          const { unitPrice, sources } = await fetchNativeUnitPrice(chain.id);
          if (abort) return;
          setUsdValue(unitPrice > 0 ? unitPrice * amt : 0);
          setPriceSources(
            sources.map((s: any) => {
              const label = `${String(s.source)}${s?.updatedAt ? ` (${formatAgo(Number(s.updatedAt))})` : ''}`;
              return { price: Number(s.price || 0), source: label };
            })
          );
          setFetchStatus(sources.length ? 'found' : 'not_found');
        } else if (token.contract) {
          const { unitPrice, sources } = await fetchErc20UnitPrice(chain.id, token.contract);
          if (abort) return;
          setUsdValue(unitPrice > 0 ? unitPrice * amt : 0);
          setPriceSources(
            sources.map((s: any) => {
              const label = `${String(s.source)}${s?.updatedAt ? ` (${formatAgo(Number(s.updatedAt))})` : ''}`;
              return { price: Number(s.price || 0), source: label };
            })
          );
          setFetchStatus(sources.length ? 'found' : 'not_found');
        } else {
          setUsdValue(0);
          setPriceSources([]);
          setFetchStatus('not_found');
        }
      } catch {
        if (!abort) setFetchStatus('error');
      }
    }
    load();
    return () => { abort = true; };
  }, [isOpen, chain.id, token.isNative, token.contract, amount]);

  const confirmLabel = useMemo(() => {
    switch (coin.phase) {
      case 'preparing': return 'Preparing…';
      case 'signing': return 'Sign in wallet…';
      case 'broadcasted': return waitForReceipt ? 'Broadcasted…' : 'Finalizing…';
      case 'waiting_receipt': return 'Waiting for receipt…';
      case 'finalizing': return 'Finalizing…';
      case 'done': return 'Done';
      default: return 'Confirm Coincarnation';
    }
  }, [coin.phase, waitForReceipt]);

  return (
    <ConfirmModal
      isOpen={isOpen}
      onCancel={onClose}
      onDeadcoinVote={() => {}}
      onConfirm={async () => {
        const res = await coin.run({
          token,
          amount,
          usdValue,
          waitForReceipt, // NEW
        });
        if (res?.hash) onSuccess?.(res.hash);
      }}
      confirmBusy={coin.phase !== 'idle' && coin.phase !== 'done'}
      confirmLabel={confirmLabel}

      tokenSymbol={token.symbol}
      amount={Number(amount || 0)}
      usdValue={usdValue}
      tokenCategory={null}

      priceSources={priceSources}
      fetchStatus={fetchStatus}

      tokenContract={token.contract}
      networkLabel={chain.name}
      currentWallet={account}

      tokenMint={undefined}
    />
  );
}
