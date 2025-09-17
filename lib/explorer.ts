import type { Chain } from '@/lib/chain/types';

const EXPLORERS = {
  ethereum: {
    address: (a: string) => `https://etherscan.io/address/${a}`,
    tx: (h: string) => `https://etherscan.io/tx/${h}`,
  },
  bsc: {
    address: (a: string) => `https://bscscan.com/address/${a}`,
    tx: (h: string) => `https://bscscan.com/tx/${h}`,
  },
  polygon: {
    address: (a: string) => `https://polygonscan.com/address/${a}`,
    tx: (h: string) => `https://polygonscan.com/tx/${h}`,
  },
  base: {
    address: (a: string) => `https://basescan.org/address/${a}`,
    tx: (h: string) => `https://basescan.org/tx/${h}`,
  },
  solana: {
    // Primary explorer
    address: (a: string) => `https://explorer.solana.com/address/${a}`,
    tx: (h: string) => `https://explorer.solana.com/tx/${h}`,
    // Alts: solscan/solana.fm if you need them
    altAddress: (a: string) => `https://solscan.io/account/${a}`,
    altTx: (h: string) => `https://solscan.io/tx/${h}`,
  },
} as const;

export function addressExplorer(chain: Chain, address: string): string {
  if (chain === 'solana') return EXPLORERS.solana.address(address);
  return EXPLORERS[chain as Exclude<Chain, 'solana'>].address(address);
}

export function txExplorer(chain: Chain, hash: string): string {
  if (chain === 'solana') return EXPLORERS.solana.tx(hash);
  return EXPLORERS[chain as Exclude<Chain, 'solana'>].tx(hash);
}

/** If you need both + alts in one call */
export function addressTxExplorer(
  chain: Chain,
  addressOrTx: string,
  kind: 'address' | 'tx'
): { primary: string; alternatives?: string[] } {
  if (chain === 'solana') {
    if (kind === 'address') {
      return {
        primary: EXPLORERS.solana.address(addressOrTx),
        alternatives: [EXPLORERS.solana.altAddress(addressOrTx)],
      };
    }
    return {
      primary: EXPLORERS.solana.tx(addressOrTx),
      alternatives: [EXPLORERS.solana.altTx(addressOrTx)],
    };
  }
  const obj = EXPLORERS[chain as Exclude<Chain, 'solana'>];
  return { primary: obj[kind](addressOrTx) };
}
