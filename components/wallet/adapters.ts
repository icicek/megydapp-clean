// components/wallet/adapters.ts
'use client';

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import type { Adapter } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';

const adapters: Adapter[] = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter({ network: WalletAdapterNetwork.Mainnet }),
  new BackpackWalletAdapter(),
];

if (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
  adapters.push(
    new WalletConnectWalletAdapter({
      network: WalletAdapterNetwork.Mainnet,
      options: {
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
        relayUrl: 'wss://relay.walletconnect.com',
        metadata: {
          name: 'Coincarnation',
          description: 'Revive your deadcoins. Coincarnate them for $MEGY.',
          url: 'https://coincarnation.com',
          icons: ['https://coincarnation.com/icon.png'],
        },
      },
    })
  );
}

export default adapters;