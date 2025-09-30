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

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  const connectByName = async (name: string) => {
    try {
      const entry = wallets.find(w => w.adapter.name === name);
      if (!entry) return console.warn('wallet not found:', name);
      if (entry.readyState !== 'Installed')
        return console.warn('wallet not installed/ready:', name, entry.readyState);
  
      // 1) context’te seçimi yap
      await select(entry.adapter.name as unknown as WalletName<string>);
  
      // 2) Yarışı tamamen ortadan kaldırmak için ADAPTER’A direkt bağlan
      //    (context de seçili olduğu için state düzgün güncellenecek)
      let lastErr: unknown = null;
      for (let i = 0; i < 3; i++) {
        try {
          await entry.adapter.connect();
          console.log('[connect] success via adapter:', name);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          console.warn('[adapter connect retry]', i + 1, e);
          await sleep(120);
        }
      }
      if (lastErr) throw lastErr;
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
