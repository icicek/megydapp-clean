// lib/chain/env.ts
// Tek kaynak: DEST adresleri env'den okunur ve doğrulanır.
// Bu dosya viem'e bağımlı DEĞİL; basit regex doğrulaması yapar.

import type { Chain } from '@/lib/chain/types';

// ENV'den değerleri çek (client'ta NEXT_PUBLIC_* görünecektir)
const DEST = {
  solana: process.env.NEXT_PUBLIC_DEST_SOL ?? '',
  ethereum: process.env.NEXT_PUBLIC_DEST_ETH ?? '',
  bsc: process.env.NEXT_PUBLIC_DEST_BSC ?? '',
  polygon: process.env.NEXT_PUBLIC_DEST_POLYGON ?? '',
  base: process.env.NEXT_PUBLIC_DEST_BASE ?? '',
} as const;

// Basit doğrulayıcılar
const SOL_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function getDestAddress(chain: Chain): string {
  const v = DEST[chain] || '';
  if (!v) {
    throw new Error(`Destination address missing for ${chain}. Please set NEXT_PUBLIC_DEST_* in your env.`);
  }
  if (chain === 'solana') {
    if (!SOL_BASE58_RE.test(v)) {
      throw new Error('Invalid Solana destination address format.');
    }
    return v;
  }
  if (!EVM_ADDR_RE.test(v)) {
    throw new Error(`Invalid EVM destination address for ${chain}. Expected 0x + 40 hex chars.`);
  }
  // Not: Burada EIP-55 checksum zorunlu kılmıyoruz; istersen viem/getAddress ile normalize edebiliriz.
  return v;
}

// (Opsiyonel) cüzdana doğru ağı switch/add için hex chainId'ler
export const EVM_CHAIN_ID_HEX: Record<Exclude<Chain, 'solana'>, `0x${string}`> = {
  ethereum: '0x1',   // 1
  bsc: '0x38',       // 56
  polygon: '0x89',   // 137
  base: '0x2105',    // 8453
};
