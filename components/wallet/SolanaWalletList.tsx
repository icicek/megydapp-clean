'use client';

import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';

type SolanaWalletId = 'Phantom' | 'Solflare' | 'Backpack';

const INSTALL_URL: Record<SolanaWalletId, string> = {
  Phantom:  'https://phantom.app/download',
  Solflare: 'https://solflare.com/download',
  Backpack: 'https://www.backpack.app/download',
};

export default function SolanaWalletList() {
  const { wallets, select, disconnect, wallet } = useWallet();

  // Wallet Standard’tan gelenleri isimle eşle
  const rows = useMemo(() => {
    const wanted: SolanaWalletId[] = ['Phantom', 'Solflare', 'Backpack'];
    return wanted.map((name) => {
      const entry = wallets.find((w) => w.adapter.name === name);
      return {
        name,
        entry,
        ready: entry?.readyState === 'Installed',
      };
    });
  }, [wallets]);

  async function connectByName(name: SolanaWalletId) {
    const entry = rows.find((r) => r.name === name)?.entry;
    if (!entry) {
      // Wallet Standard henüz keşfetmemiş olabilir; doğrudan indirme sayfasına gidelim
      window.open(INSTALL_URL[name], '_blank', 'noopener,noreferrer');
      return;
    }
    if (entry.readyState !== 'Installed') {
      // Yüklü değil → indir
      window.open(INSTALL_URL[name], '_blank', 'noopener,noreferrer');
      return;
    }

    // ——— STABİL BAĞLANTI ———
    // 1) context’te seç
    await select(entry.adapter.name as unknown as WalletName<string>);
    // 2) doğrudan adapter.connect çağır (WalletNotSelected yarışını tamamen bitirir)
    try {
      await entry.adapter.connect();
      console.log('[connect] success via adapter:', entry.adapter.name);
    } catch (e) {
      console.error('[connect] error:', e);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      {rows.map(({ name, ready }) => (
        <div key={name} className="border rounded-xl p-3 min-w-[220px]">
          <div className="font-semibold mb-1">{name}</div>
          <div className="text-xs mb-3 opacity-70">
            {ready ? 'Installed' : 'Not installed'}
          </div>

          {ready ? (
            <button
              className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
              onClick={() => connectByName(name)}
            >
              Connect {name}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                onClick={() => window.open(INSTALL_URL[name], '_blank', 'noopener,noreferrer')}
              >
                Install {name}
              </button>
              {/* Alternatif: mevcut kurulu cüzdanla devam */}
              <button
                className="px-3 py-2 rounded-md border text-sm"
                onClick={() => {
                  const firstInstalled = rows.find(r => r.ready)?.name;
                  if (firstInstalled) connectByName(firstInstalled as SolanaWalletId);
                }}
              >
                Use installed
              </button>
            </div>
          )}
        </div>
      ))}

      {wallet && (
        <button
          className="px-3 py-2 rounded-md border text-sm ml-auto"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}
