'use client';

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';

export default function WalletDebug() {
  const { wallets, wallet, connected, connecting, disconnecting, select, connect, disconnect, publicKey } = useWallet();

  useEffect(() => {
    console.log('[mount] wallet-debug mounted');
    return () => console.log('[unmount] wallet-debug unmounted');
  }, []);

  useEffect(() => {
    console.log('[wallets]', wallets.map(w => `${w.adapter.name} (${w.readyState})`));
  }, [wallets]);

  useEffect(() => {
    console.log('[state]', {
      selected: wallet?.adapter.name ?? null,
      connected, connecting, disconnecting,
      pubkey: publicKey?.toBase58?.()
    });
  }, [wallet, connected, connecting, disconnecting, publicKey]);

  const connectByName = async (name: string) => {
    try {
      const w = wallets.find(w => w.adapter.name === name);
      if (!w) return console.log('wallet not found:', name);
      await select(w.adapter.name as unknown as WalletName<string>);
      await connect();
      console.log('[connect] success:', name);
    } catch (e) {
      console.error('[connect] error:', e);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => connectByName('Phantom')} style={{ marginRight: 12 }}>Connect Phantom</button>
      <button onClick={() => connectByName('Solflare')} style={{ marginRight: 12 }}>Connect Solflare</button>
      <button onClick={() => connectByName('Backpack')} style={{ marginRight: 12 }}>Connect Backpack</button>
      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
