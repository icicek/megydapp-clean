'use client';

import React, { useMemo, useState } from 'react';
import { useWalletHub } from '@/app/providers/WalletHub';
import type { Chain } from '@/lib/chain/types';

function short(addr?: string | null) {
  if (!addr) return '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

const CHAINS: Chain[] = ['solana', 'ethereum', 'bsc', 'polygon', 'base', 'arbitrum'];

export default function ConnectBar() {
  const hub = useWalletHub();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const canSwitch = useMemo(() => {
    // Solana marka bağlıyken başka ağa geçilemez (tek zincirli)
    return hub.brand && (hub.brand === 'metamask' || hub.brand === 'rabby' || hub.brand === 'trust' || hub.brand === 'walletconnect');
  }, [hub.brand]);

  const onChainClick = async (c: Chain) => {
    try {
      if (!canSwitch && c !== 'solana') return; // Solana marka aktifken diğerleri disabled
      await hub.switchChain(c);
    } catch (e) {
      // Kullanıcı cüzdanda switch'i reddedebilir → hata bastır, UI geri döner
      console.warn('switchChain rejected', e);
    }
  };

  return (
    <div className="w-full flex items-center justify-end gap-3">
      {/* Chain chips */}
      <div className="flex items-center gap-2">
        {CHAINS.map((c) => {
          const active = hub.chainKey === c;
          const disabled = !canSwitch && c !== 'solana'; // Solana marka ise sadece solana aktif
          return (
            <button
              key={c}
              onClick={() => onChainClick(c)}
              disabled={disabled}
              className={[
                'px-3 py-1 rounded-full border text-xs',
                active ? 'bg-white text-black border-white' : 'bg-transparent text-white/90 border-white/20 hover:bg-white/10',
                disabled ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
              aria-pressed={active}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Connect / Address */}
      {!hub.isConnected ? (
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold"
        >
          Connect
        </button>
      ) : (
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm"
          >
            {short(hub.account)} <span className="opacity-60">•</span> {hub.chainKey}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 z-20 w-48 rounded-xl border border-white/10 bg-black/90 backdrop-blur p-1">
                <button
                  onClick={() => {
                    if (!hub.account) return;
                    navigator.clipboard?.writeText(hub.account).catch(() => {});
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  Copy Address
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setModalOpen(true); // Change wallet → modalı tekrar aç
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                >
                  Change Wallet
                </button>
                <div className="h-[1px] my-1 bg-white/10" />
                <button
                  onClick={async () => {
                    try { await hub.disconnect(); } catch {}
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-red-300"
                >
                  Disconnect
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal */}
      <ConnectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

// Lazy import to avoid circular deps in some setups
// (you can move this to the top if your project structure is fine)
import dynamic from 'next/dynamic';
const ConnectModal = dynamic(() => import('./ConnectModal'), { ssr: false });
