// lib/chain/env.ts
import type { Chain } from '@/lib/chain/types';

const SOL_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

/** Env'i her çağrıda oku (build-time const yerine) */
function readEnv() {
  const sol = (process.env.NEXT_PUBLIC_DEST_SOL ?? '').toString().trim();
  const eth = (process.env.NEXT_PUBLIC_DEST_ETH ?? '').toString().trim();
  const bsc = (process.env.NEXT_PUBLIC_DEST_BSC ?? '').toString().trim();
  const polygon = (process.env.NEXT_PUBLIC_DEST_POLYGON ?? '').toString().trim();
  const base = (process.env.NEXT_PUBLIC_DEST_BASE ?? '').toString().trim();
  const arbitrum = (process.env.NEXT_PUBLIC_DEST_ARBITRUM ?? '').toString().trim();
  return { solana: sol, ethereum: eth, bsc, polygon, base, arbitrum } as const;
}

/** Dışa açık debug: konsola basmak için kullanışlı */
export function __dest_debug__() {
  return readEnv();
}

export function getDestAddress(chain: Chain): string {
  const env = readEnv();
  const v = env[chain as keyof typeof env] || '';

  if (!v) {
    const key = chain === 'solana' ? 'NEXT_PUBLIC_DEST_SOL' : `NEXT_PUBLIC_DEST_${chain.toUpperCase()}`;
    throw new Error(`Destination address is not configured. Please set ${key}.`);
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
