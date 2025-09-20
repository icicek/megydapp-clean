'use client';

import React, { useMemo, useState } from 'react';
import { useChain } from '@/app/providers/ChainProvider';
import useChainWallet from '@/hooks/useChainWallet';
import { getDestAddress } from '@/lib/chain/env';
import { sendNative } from '@/lib/chain/evmTransfer';
import { txExplorer } from '@/lib/explorer';
import { EVM_CHAIN_ID_HEX, isEvmChainKey } from '@/lib/chain/evm';

export default function CoincarneModal() {
  const { chain } = useChain();
  const { address, connected, connecting, connect } = useChainWallet();

  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  const dest = useMemo(() => {
    try {
      return getDestAddress(chain);
    } catch {
      return '';
    }
  }, [chain]);

  const decimals = 18; // EVM native: ETH/BNB/MATIC/BASE/ARB

  async function ensureCorrectNetwork() {
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;
    if (!eth || chain === 'solana') return;

    if (!isEvmChainKey(chain)) return; 
    const want = EVM_CHAIN_ID_HEX[chain]; 

    try {
      const current = await eth.request({ method: 'eth_chainId' });
      if (String(current)?.toLowerCase() === want.toLowerCase()) return;

      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: want }],
      });
    } catch (e: any) {
      if (String(e?.code) === '4902') {
        const paramsMap: Record<
          typeof chain,
          {
            chainId: `0x${string}`;
            chainName: string;
            nativeCurrency: { name: string; symbol: string; decimals: number };
            rpcUrls: string[];
            blockExplorerUrls: string[];
          }
        > = {
          ethereum: {
            chainId: '0x1',
            chainName: 'Ethereum Mainnet',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: (process.env.NEXT_PUBLIC_ETH_RPC || '').split(',').filter(Boolean),
            blockExplorerUrls: ['https://etherscan.io'],
          },
          bsc: {
            chainId: '0x38',
            chainName: 'BNB Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: (process.env.NEXT_PUBLIC_BSC_RPC || '').split(',').filter(Boolean),
            blockExplorerUrls: ['https://bscscan.com'],
          },
          polygon: {
            chainId: '0x89',
            chainName: 'Polygon',
            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            rpcUrls: (process.env.NEXT_PUBLIC_POLYGON_RPC || '').split(',').filter(Boolean),
            blockExplorerUrls: ['https://polygonscan.com'],
          },
          base: {
            chainId: '0x2105',
            chainName: 'Base',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: (process.env.NEXT_PUBLIC_BASE_RPC || '').split(',').filter(Boolean),
            blockExplorerUrls: ['https://basescan.org'],
          },
          arbitrum: {
            chainId: '0xa4b1',
            chainName: 'Arbitrum One',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: (process.env.NEXT_PUBLIC_ARBITRUM_RPC || '').split(',').filter(Boolean),
            blockExplorerUrls: ['https://arbiscan.io'],
          },
        };

        const p = paramsMap[chain];
        if (p?.rpcUrls?.length) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [p] });
        } else {
          throw new Error('Please add the network in your wallet (missing RPC URL).');
        }
      } else {
        throw e;
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setTx(null);

    if (!dest) {
      setErr('Destination address is not configured. Please set NEXT_PUBLIC_DEST_* env.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setErr('Enter a positive amount.');
      return;
    }

    try {
      if (!connected) {
        await connect();
      }
      if (chain !== 'solana') {
        await ensureCorrectNetwork();
      }

      setSubmitting(true);

      if (chain === 'solana') {
        throw new Error('Solana flow is not wired here. Use your existing Solana modal.');
      } else {
        const hash = await sendNative({
          to: dest as `0x${string}`,
          amount: Number(amount),
          decimals,
          chain,
        });
        setTx(hash);
      }
    } catch (e: any) {
      setErr(String(e?.message || e) || 'Failed to send.');
    } finally {
      setSubmitting(false);
    }
  }

  const explorerHref = tx ? txExplorer(chain, tx) : '#';

  return (
    <div className="p-4">
      {chain === 'solana' ? (
        <p className="text-xs text-amber-400 mb-3">
          This component uses EVM branch. Keep Solana with your existing modal flow.
        </p>
      ) : (
        <p className="text-xs text-gray-400 mb-3">
          Network: <b>{chain.toUpperCase()}</b> — native transfer (ERC-20 next).
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Destination</label>
          <input value={dest} readOnly className="w-full rounded bg-zinc-800 px-3 py-2 text-sm opacity-80" />
        </div>

        <div>
          <label className="block text-sm mb-1">Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
            className="w-full rounded bg-zinc-800 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || connecting}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded px-3 py-2 text-sm font-semibold"
        >
          {submitting ? 'Sending…' : connected ? 'Send' : 'Connect & Send'}
        </button>
      </form>

      {tx && (
        <div className="mt-3 text-sm">
          <a className="text-sky-400 underline" href={explorerHref} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </div>
      )}

      {err && <div className="mt-2 text-sm text-red-400">{err}</div>}
    </div>
  );
}
