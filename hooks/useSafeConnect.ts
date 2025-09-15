// hooks/useSafeConnect.ts
'use client';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';

export function useSafeConnect() {
  const { wallets, select } = useWallet();

  return {
    async connectByName(name: WalletName) {
      const entry = wallets.find(w => (w.adapter.name as WalletName) === name);
      if (!entry) throw new Error(`Wallet ${String(name)} not found`);
      const { adapter, readyState } = entry;
      if (!['Installed', 'Loadable'].includes(String(readyState))) {
        throw new Error(`Wallet ${String(name)} not ready (${readyState})`);
      }
      select(name);
      await Promise.resolve(); // microtask
      await adapter.connect();
      return adapter.publicKey ?? null;
    }
  };
}
