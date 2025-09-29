/// <reference types="node" />

import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
// Backpack istersen ekle; yoksa yoruma al
// import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';

// WalletConnect'i şimdilik devre dışı bırakıyoruz (teşhis safhasında sade kalsın)
// import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-wallets';
// const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID as string | undefined;

const adapters = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  // new BackpackWalletAdapter(),
  // ...(projectId ? [new (WalletConnectWalletAdapter as any)({ projectId, relayUrl: 'wss://relay.walletconnect.com' })] : []),
];

export default adapters;
