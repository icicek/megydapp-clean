// lib/chain/env.ts
import type { Chain } from '@/lib/chain/types';

// Not: viem sadece client bundle'a girse de bu dosya okunurken tipleri şart değil.
// isAddress/getAddress runtime'ta da faydalı.
import { isAddress, getAddress } from 'viem';

const DEST = {
  solana: process.env.NEXT_PUBLIC_DEST_SOL ?? '',
  ethereum: process.env.NEXT_PUBLIC_DEST_ETH ?? '',
  bsc: process.env.NEXT_PUBLIC_DEST_BSC ?? '',
  polygon: process.env.NEXT_PUBLIC_DEST_POLYGON ?? '',
  base: process.env.NEXT_PUBLIC_DEST_BASE ?? '',
} as const;

export function getDestAddress(chain: Chain): string {
  const v = DEST[chain] || '';
  if (!v) {
    throw new Error(`Destination address missing for chain: ${chain}. Please set NEXT_PUBLIC_DEST_* env.`);
  }
  if (chain === 'solana') {
    // basit kontrol: base58 benzeri
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) {
      throw new Error('Invalid Solana destination address format.');
    }
    return v;
  }
  // EVM doğrulama
  if (!isAddress(v)) {
    throw new Error(`Invalid EVM destination address for ${chain}.`);
  }
  // getAddress => checksummed form
  return getAddress(v);
}

// (opsiyonel) chainId'ler (wallet_switchEthereumChain için)
export const EVM_CHAIN_ID_HEX: Record<Exclude<Chain, 'solana'>, `0x${string}`> = {
  ethereum: '0x1',   // 1
  bsc: '0x38',       // 56
  polygon: '0x89',   // 137
  base: '0x2105',    // 8453
};
