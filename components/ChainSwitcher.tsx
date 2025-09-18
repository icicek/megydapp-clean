// components/ChainSwitcher.tsx
'use client';

import { useChain } from '@/app/providers/ChainProvider';
import type { Chain } from '@/lib/chain/types';

const CHAINS: Chain[] = ['solana', 'ethereum', 'bsc', 'polygon', 'base'];

export default function ChainSwitcher({ className = '' }: { className?: string }) {
  const { chain, setChain } = useChain();

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <label htmlFor="chain-select" className="text-xs text-gray-400">Chain</label>
      <select
        id="chain-select"
        value={chain}
        onChange={(e) => setChain(e.target.value as Chain)}
        className="bg-zinc-800 border border-white/10 rounded px-2 py-1 text-sm"
      >
        {CHAINS.map((c) => (
          <option key={c} value={c}>
            {c.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
