// components/wallet/adapters.ts
/// <reference types="node" />

import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
// İstersen sonra ekle: import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
// Şimdilik WalletConnect'i kapalı tutuyoruz; çekirdeği izole etmek için.

type AnyWin = Window & { __SOL_ADAPTERS?: any[] };
const g: AnyWin | (typeof globalThis & { __SOL_ADAPTERS?: any[] }) =
  (typeof window !== 'undefined' ? window : globalThis) as any;

// HMR/fast-refresh'te bile tek kopya
if (!g.__SOL_ADAPTERS) {
  g.__SOL_ADAPTERS = [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    // new BackpackWalletAdapter(),
    // WalletConnect'i teşhis bitince ekleyebiliriz
  ];
}

const adapters = g.__SOL_ADAPTERS!;
export default adapters;
