'use client';

import { Address, Chain, Hex } from 'viem';
import { useState, useCallback } from 'react';
import { evmNetworkSlug } from '@/lib/evm/network';
import { makeIdempotencyKey } from '@/lib/idempotency';
import { getDestAddressForChainId } from '@/lib/evm/getDestAddress';
import { sendNativeTransfer, sendErc20Transfer } from '@/lib/evm/transfer';

export type SendPhase = 'idle' | 'preparing' | 'signing' | 'broadcasted' | 'waiting_receipt' | 'finalizing' | 'done' | 'error';

type Ctx = {
  chain: Chain;
  account: Address;
  walletClient: any; // viem WalletClient
  publicClient: any; // viem PublicClient
};

type TokenLike = {
  isNative: boolean;
  symbol: string;
  decimals: number;
  contract?: `0x${string}`;
  name?: string;
};

export default function useEvmCoincarnation(ctx?: Ctx) {
  const [phase, setPhase] = useState<SendPhase>('idle');
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (params: {
    token: TokenLike;
    amount: string;         // human
    usdValue: number;       // pricing result (total)
    referralCode?: string | null;
    userAgent?: string | null;
    waitForReceipt?: boolean; // NEW: default false
  }) => {
    setError(null);
    setPhase('preparing');
    setTxHash(null);

    if (!ctx?.account || !ctx?.walletClient || !ctx?.publicClient) {
      throw new Error('EVM wallet is not connected');
    }

    const dest = getDestAddressForChainId(ctx.chain.id);
    const network = evmNetworkSlug(ctx.chain);
    const idem = makeIdempotencyKey(`${ctx.chain.id}:${ctx.account}:${params.token.contract ?? 'native'}:${params.amount}`);

    // 1) INTENT (pre-record; no tx hash yet)
    await fetch('/api/coincarnation/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
      body: JSON.stringify({
        network,
        wallet_address: ctx.account,
        token_symbol: params.token.symbol,
        token_contract: params.token.contract ?? null,
        token_amount: Number(params.amount),
        usd_value: Number(params.usdValue) || 0,
        user_agent: params.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        referral_code: params.referralCode ?? null,
        idempotency_key: idem,
      }),
    });

    // 2) ON-CHAIN TRANSFER
    setPhase('signing');
    let hash: Hex;
    if (params.token.isNative) {
      const res = await sendNativeTransfer({
        chain: ctx.chain,
        account: ctx.account,
        walletClient: ctx.walletClient,
        publicClient: ctx.publicClient,
        to: dest,
        amount: params.amount,
      });
      hash = res.hash;
    } else {
      if (!params.token.contract) throw new Error('Missing token contract for ERC-20 transfer');
      const res = await sendErc20Transfer({
        chain: ctx.chain,
        account: ctx.account,
        walletClient: ctx.walletClient,
        publicClient: ctx.publicClient,
        token: params.token.contract,
        to: dest,
        amount: params.amount,
        decimals: params.token.decimals,
      });
      hash = res.hash;
    }

    setTxHash(hash);
    setPhase('broadcasted');

    // (optional) wait for receipt
    let tx_block: number | null = null;
    if (params.waitForReceipt) {
      setPhase('waiting_receipt');
      try {
        const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
        if (receipt?.blockNumber != null) {
          const n = Number(receipt.blockNumber);
          tx_block = Number.isFinite(n) ? n : null;
        }
      } catch (e) {
        // ignore wait errors; we can still finalize with hash-only
      }
    }

    // 3) FINALIZE
    setPhase('finalizing');
    await fetch('/api/coincarnation/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
      body: JSON.stringify({
        network,
        wallet_address: ctx.account,
        token_symbol: params.token.symbol,
        token_contract: params.token.contract ?? null,
        token_amount: Number(params.amount),
        usd_value: Number(params.usdValue) || 0,
        user_agent: params.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        referral_code: params.referralCode ?? null,
        idempotency_key: idem,
        tx_hash: hash,
        tx_block, // may be null if not waited or missing
      }),
    });

    setPhase('done');
    return { hash, idem, tx_block };
  }, [ctx?.account, ctx?.walletClient, ctx?.publicClient, ctx?.chain]);

  return { phase, txHash, error, run, setPhase, setError };
}
