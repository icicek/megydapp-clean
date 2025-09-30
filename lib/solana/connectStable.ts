// lib/solana/connectStable.ts
import type { WalletName } from '@solana/wallet-adapter-base';
import type { WalletContextState } from '@solana/wallet-adapter-react';

export async function connectStable(name: string, ctx: WalletContextState) {
  const entry = ctx.wallets.find(w => w.adapter.name === name);
  if (!entry) throw new Error('Wallet not found: ' + name);

  // 1) select
  await ctx.select(entry.adapter.name as unknown as WalletName<string>);

  // 2) doğrudan adapter.connect (yarışı bitirir)
  try {
    await entry.adapter.connect();
  } catch (e) {
    // Bazı temalarda ilk denemede iptal/yarış olabilir → bir kez daha dene
    try {
      await entry.adapter.connect();
    } catch (e2) {
      throw e2;
    }
  }
}
