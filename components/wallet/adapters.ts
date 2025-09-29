// components/wallet/adapters.ts
/// <reference types="node" />  // process tipleri için (gerekliyse)

import { PhantomWalletAdapter, SolflareWalletAdapter, WalletConnectWalletAdapter } from '@solana/wallet-adapter-wallets';
// Backpack çoğu kurulumda ayrı paketten gelir:
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'; // ← yoksa paketi ekleyin: npm i @solana/wallet-adapter-backpack

// env'i netleştir
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID as string | undefined;

/**
 * Modül seviyesinde tek kez oluşturulur; süreç boyunca aynı kalır.
 */
const adapters = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  // Backpack paketi yoksa bu satırı yoruma alın
  new BackpackWalletAdapter(),
  // WalletConnect: sürümler arası tip farklarını 'as any' ile kapat
  ...(projectId
    ? [
        new (WalletConnectWalletAdapter as any)({
          projectId,
          relayUrl: 'wss://relay.walletconnect.com',
        }),
      ]
    : []),
];

export default adapters;
