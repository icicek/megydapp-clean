import { Chain } from 'viem';

export function evmNetworkSlug(chain: Chain | { id: number }): 'ethereum' | 'bsc' | 'polygon' | 'base' | 'arbitrum' {
  switch (chain.id) {
    case 1: return 'ethereum';
    case 56: return 'bsc';
    case 137: return 'polygon';
    case 8453: return 'base';
    case 42161: return 'arbitrum';
    default: return 'ethereum';
  }
}
