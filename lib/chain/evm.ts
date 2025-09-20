// /lib/chain/evm.ts
import type { Chain } from '@/lib/chain/types';

export type EvmChainKey = Exclude<Chain, 'solana'>;

export const EVM_CHAIN_ID_HEX: Record<EvmChainKey, `0x${string}`> = {
  ethereum: '0x1',
  bsc: '0x38',
  polygon: '0x89',
  base: '0x2105',
  arbitrum: '0xa4b1',
};

export function evmChainKeyFromHex(hex?: string | number | null): EvmChainKey | null {
  if (!hex) return null;
  const h = typeof hex === 'number' ? `0x${hex.toString(16)}` : String(hex).toLowerCase();
  for (const [key, val] of Object.entries(EVM_CHAIN_ID_HEX)) {
    if (val.toLowerCase() === h) return key as EvmChainKey;
  }
  return null;
}
export function isEvmChainKey(x: Chain): x is EvmChainKey {
    return x !== 'solana';
}