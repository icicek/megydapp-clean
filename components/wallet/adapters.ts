// components/wallet/adapters.ts
'use client';

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';

const adapters: any[] = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter({ network: WalletAdapterNetwork.Mainnet }),
];

// WalletConnect (opsiyonel)
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