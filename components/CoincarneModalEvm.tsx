// components/CoincarneModalEvm.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useChain } from '@/app/providers/ChainProvider';
import useChainWallet from '@/hooks/useChainWallet';
import { getDestAddress, EVM_CHAIN_ID_HEX } from '@/lib/chain/env';
import { sendNative } from '@/lib/chain/evmTransfer';
import { txExplorer } from '@/lib/explorer';
import type { Chain } from '@/lib/chain/types';

type Props = {
  onClose: () => void;
  onGoToProfileRequest?: () => void;
};

type EvmChain = Exclude<Chain, 'solana'>;

export default function CoincarneModalEvm({ onClose, onGoToProfileRequest }: Props) {
  const { chain } = useChain(); // 'solana' | 'ethereum' | 'bsc' | 'polygon' | 'base'
  const { address, connected, connecting, connect, icon } = useChainWallet();

  // Bu modal sadece EVM için. TS daraltması:
  const evmChain: EvmChain = useMemo(() => {
    return chain === 'solana' ? 'ethereum' : (chain as EvmChain);
  }, [chain]);

  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [dest, setDest] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    try {
      const d = getDestAddress(evmChain);
      if (!d.startsWith('0x') || d.length !== 42) throw new Error('Invalid EVM destination address');
      setDest(d as `0x${string}`);
      setErr(null);
    } catch (e: any) {
      setDest(null);
      setErr('Destination address is not configured. Please set NEXT_PUBLIC_DEST_* for this chain.');
    }
  }, [evmChain]);

  const decimals = 18; // ETH/BNB/MATIC/BASE native hepsi 18
  const short = (k?: string | null) => (k ? k.slice(0, 6) + '…' + k.slice(-4) : '');

  async function ensureCorrectNetwork() {
    if (typeof window === 'undefined') return;
    const eth = (window as any).ethereum;
    if (!eth) throw new Error('No EVM wallet detected');

    const want = EVM_CHAIN_ID_HEX[evmChain];
    const current = await eth.request({ method: 'eth_chainId' });
    if ((current || '').toLowerCase() === want.toLowerCase()) return;

    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
    } catch (e: any) {
      if (String(e?.code) === '4902') {
        // addEthereumChain
        const rpcEnvMap: Record<EvmChain, string | undefined> = {
          ethereum: process.env.NEXT_PUBLIC_ETH_RPC,
          bsc: process.env.NEXT_PUBLIC_BSC_RPC,
          polygon: process.env.NEXT_PUBLIC_POLYGON_RPC,
          base: process.env.NEXT_PUBLIC_BASE_RPC,
        };
        const rpcUrls = (rpcEnvMap[evmChain] || '').split(',').map(s => s.trim()).filter(Boolean);
        const paramsMap: Record<EvmChain, any> = {
          ethereum: {
            chainId: '0x1',
            chainName: 'Ethereum Mainnet',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals },
            rpcUrls,
            blockExplorerUrls: ['https://etherscan.io'],
          },
          bsc: {
            chainId: '0x38',
            chainName: 'BNB Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals },
            rpcUrls,
            blockExplorerUrls: ['https://bscscan.com'],
          },
          polygon: {
            chainId: '0x89',
            chainName: 'Polygon',
            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals },
            rpcUrls,
            blockExplorerUrls: ['https://polygonscan.com'],
          },
          base: {
            chainId: '0x2105',
            chainName: 'Base',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals },
            rpcUrls,
            blockExplorerUrls: ['https://basescan.org'],
          },
        };
        const p = paramsMap[evmChain];
        if (!p?.rpcUrls?.length) throw new Error('Please configure RPC URLs for this chain.');
        await eth.request({ method: 'wallet_addEthereumChain', params: [p] });
      } else {
        throw e;
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setTx(null);
    if (!dest) return setErr('Missing destination address.');
    if (!amount || Number(amount) <= 0) return setErr('Enter a positive amount.');

    try {
      if (!connected) await connect();
      await ensureCorrectNetwork();

      setSubmitting(true);

      const hash = await sendNative({
        to: dest,
        amount: Number(amount),
        decimals,
        chain: evmChain,
      });
      setTx(hash);
    } catch (e: any) {
      setErr(String(e?.message || e) || 'Failed to send.');
    } finally {
      setSubmitting(false);
    }
  }

  // Explorer href: string
  const explorerHref = useMemo<string>(() => {
    return tx ? txExplorer(evmChain, tx) : '#';
  }, [tx, evmChain]);

  // Yanlışlıkla Solana iken render edildiyse (parent guard yoksa):
  if (chain === 'solana') {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogOverlay />
        <DialogContent className="z-50 bg-zinc-900 text-white rounded-2xl p-6 max-w-md w-full">
          <DialogTitle className="text-lg font-semibold">Wrong modal</DialogTitle>
          <p className="text-sm text-gray-300 mt-2">This modal is for EVM networks. Please switch chain.</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogOverlay />
      <DialogContent className="z-50 bg-gradient-to-br from-black to-zinc-900 text-white rounded-2xl p-6 max-w-md w-full h-[90vh] overflow-y-auto flex flex-col justify-center">
        <DialogTitle className="sr-only">Coincarnate (EVM)</DialogTitle>
        <DialogDescription className="sr-only">
          Send native coin to the treasury on EVM networks.
        </DialogDescription>

        <h2 className="text-2xl font-bold text-center mb-3">
          🔥 Coincarnate (EVM) — {evmChain.toUpperCase()}
        </h2>

        <div className="text-sm text-gray-400 text-center mb-3">
          {connecting ? 'Connecting…' : connected ? (
            <>
              {icon ? <img src={icon as any} alt="" className="inline h-4 w-4 mr-1 rounded-sm" /> : '👛 '}
              {short(address)}
            </>
          ) : 'Wallet not connected'}
        </div>

        {err && <div className="text-xs text-amber-400 text-center mb-3">{err}</div>}

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Destination</label>
            <input
              value={dest || ''}
              readOnly
              className="w-full rounded bg-zinc-800 px-3 py-2 text-sm opacity-80"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Amount (native)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full rounded bg-zinc-800 px-3 py-2 text-sm"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || connecting}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded px-3 py-2 text-sm font-semibold w-full"
          >
            {submitting ? 'Sending…' : connected ? 'Send' : 'Connect & Send'}
          </button>
        </form>

        {tx && (
          <div className="mt-4 text-sm text-center">
            <a className="text-sky-400 underline" href={explorerHref} target="_blank" rel="noreferrer">
              View transaction
            </a>
          </div>
        )}

        <button
          onClick={() => {
            onClose();
            onGoToProfileRequest?.();
          }}
          className="mt-6 w-full text-sm text-gray-400 hover:text-white"
        >
          Go to profile
        </button>
      </DialogContent>
    </Dialog>
  );
}
