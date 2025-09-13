// hooks/useSafeConnect.ts
'use client';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useSafeConnect() {
  const { wallets, wallet, select, connect, connected, publicKey } = useWallet();

  async function connectByName(name: WalletName, opts?: { waitMs?: number; tries?: number }) {
    const waitMs = opts?.waitMs ?? 25;
    const tries = opts?.tries ?? 60; // 60*25ms = 1.5s

    const found = wallets.find(w => (w.adapter.name as WalletName) === name);
    if (!found) throw new Error(`Wallet ${String(name)} not found`);
    if (!['Installed', 'Loadable'].includes(String(found.readyState))) {
      throw new Error(`Wallet ${String(name)} not ready (${found.readyState})`);
    }

    // 1) select
    select(name);

    // 2) state commit olana kadar bekle
    for (let i = 0; i < tries; i++) {
      if (wallet?.adapter?.name === name) break;
      await sleep(waitMs);
    }
    if (wallet?.adapter?.name !== name) {
      // son bir kez daha select edip microtask bekle
      select(name);
      await Promise.resolve();
    }

    // 3) connect
    await connect();

    // 4) publicKey propagate olana kadar kısa bekleme (UI için)
    for (let i = 0; i < tries; i++) {
      if (publicKey) break;
      await sleep(waitMs);
    }

    return { connected, publicKey };
  }

  return { connectByName };
}
