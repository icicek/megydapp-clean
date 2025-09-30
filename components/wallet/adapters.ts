/// <reference types="node" />
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
type G = typeof globalThis & { __SOL_ADAPTERS?: any[] };
const g = globalThis as G;
if (!g.__SOL_ADAPTERS) {
  g.__SOL_ADAPTERS = [ new PhantomWalletAdapter(), new SolflareWalletAdapter() ];
}
const adapters = g.__SOL_ADAPTERS!;
export default adapters;
