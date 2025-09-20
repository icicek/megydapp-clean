// /lib/explorer.ts
import type { Chain } from '@/lib/chain/types';
import { type EvmChainKey, isEvmChainKey } from '@/lib/chain/evm';

type ExFns = { address: (a: string) => string; tx: (h: string) => string };

const EVM_EXPLORERS: Record<EvmChainKey, ExFns> = {
  ethereum: {
    address: (a) => `https://etherscan.io/address/${a}`,
    tx: (h) => `https://etherscan.io/tx/${h}`,
  },
  bsc: {
    address: (a) => `https://bscscan.com/address/${a}`,
    tx: (h) => `https://bscscan.com/tx/${h}`,
  },
  polygon: {
    address: (a) => `https://polygonscan.com/address/${a}`,
    tx: (h) => `https://polygonscan.com/tx/${h}`,
  },
  base: {
    address: (a) => `https://basescan.org/address/${a}`,
    tx: (h) => `https://basescan.org/tx/${h}`,
  },
  arbitrum: {
    address: (a) => `https://arbiscan.io/address/${a}`,
    tx: (h) => `https://arbiscan.io/tx/${h}`,
  },
};

const SOL_EXPLORER: ExFns = {
  address: (a) => `https://solscan.io/account/${a}`,
  tx: (h) => `https://solscan.io/tx/${h}`,
};

export function addressExplorer(chain: Chain, address: string): string {
  if (isEvmChainKey(chain)) return EVM_EXPLORERS[chain].address(address);
  return SOL_EXPLORER.address(address);
}

export function txExplorer(chain: Chain, hash: string): string {
  if (isEvmChainKey(chain)) return EVM_EXPLORERS[chain].tx(hash);
  return SOL_EXPLORER.tx(hash);
}

// İstersen ana sayfa linki de:
export function explorerHome(chain: Chain): string {
  if (isEvmChainKey(chain)) {
    switch (chain) {
      case 'ethereum': return 'https://etherscan.io';
      case 'bsc': return 'https://bscscan.com';
      case 'polygon': return 'https://polygonscan.com';
      case 'base': return 'https://basescan.org';
      case 'arbitrum': return 'https://arbiscan.io';
    }
  }
  return 'https://solscan.io';
}
