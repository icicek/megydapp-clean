// lib/chain/env.ts
import type { Chain } from '@/lib/chain/types';

const read = (k: string) => (process.env[k] ?? '').toString().trim();

const DEST = {
  solana: read('NEXT_PUBLIC_DEST_SOL'),
  ethereum: read('NEXT_PUBLIC_DEST_ETH'),
  bsc: read('NEXT_PUBLIC_DEST_BSC'),
  polygon: read('NEXT_PUBLIC_DEST_POLYGON'),
  base: read('NEXT_PUBLIC_DEST_BASE'),
} as const;

const SOL_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function getDestAddress(chain: Chain): string {
  const v = DEST[chain] || '';
  if (!v) {
    throw new Error(
      chain === 'solana'
        ? 'Destination address is not configured. Please set NEXT_PUBLIC_DEST_SOL.'
        : `Destination address is not configured. Please set NEXT_PUBLIC_DEST_${chain.toUpperCase()}.`
    );
  }
  if (chain === 'solana') {
    if (!SOL_BASE58_RE.test(v)) {
      throw new Error('Invalid Solana destination address format (base58, ~44 chars).');
    }
    return v;
  }
  if (!EVM_ADDR_RE.test(v)) {
    throw new Error(`Invalid EVM destination address for ${chain} (0x…40 hex).`);
  }
  return v;
}

export const EVM_CHAIN_ID_HEX = {
  ethereum: '0x1',
  bsc: '0x38',
  polygon: '0x89',
  base: '0x2105',
} as const;

// (isteğe bağlı) runtime debug için export et
export const __DEST_DEBUG__ = DEST;
