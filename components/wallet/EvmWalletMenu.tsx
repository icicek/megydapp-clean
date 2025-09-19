'use client';

import React, { useMemo, useState } from 'react';
import type { Chain as EvmChain } from 'viem/chains';
import useChainWalletEvm from '@/hooks/useChainWalletEvm';

type Props = {
  evm: ReturnType<typeof useChainWalletEvm>;
  targetChain: EvmChain;
};

export default function EvmWalletMenu({ evm, targetChain }: Props) {
  const [open, setOpen] = useState(false);

  const addrShort = useMemo(() => {
    const a = evm.account ? String(evm.account) : '';
    return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
  }, [evm.account]);

  const wrongNet = evm.isConnected && typeof evm.chainId === 'number' && evm.chainId !== targetChain.id;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-2 rounded-lg text-sm font-medium border ${
          evm.isConnected ? 'bg-violet-700/80 border-violet-600' : 'bg-indigo-600 border-indigo-500'
        }`}
      >
        {evm.isConnected ? addrShort : 'Connect EVM Wallet'}
      </button>

      {wrongNet && (
        <span className="ml-2 text-amber-300 text-xs align-middle">Wrong network</span>
      )}

      {open && (
        <div
          className="absolute right-0 mt-2 w-64 z-40 rounded-xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur"
          onMouseLeave={() => setOpen(false)}
        >
          {!evm.isConnected ? (
            <div className="py-2">
              {evm.wallets.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-400">
                  Open your EVM wallet (MetaMask, Rabby, OKX…) then refresh.
                </div>
              ) : (
                evm.wallets.map(w => (
                  <button
                    key={w.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 flex items-center gap-2"
                    onClick={async () => {
                      evm.selectWallet(w.id);
                      await evm.connect();
                      setOpen(false);
                    }}
                  >
                    {w.icon ? <img src={w.icon} className="h-4 w-4 rounded" alt="" /> : <span>🦊</span>}
                    <span className="truncate">{w.name}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="py-2">
              {wrongNet && (
                <button
                  className="w-full text-left px-3 py-2 text-sm text-amber-300 hover:bg-gray-800"
                  onClick={async () => {
                    await evm.switchChain(targetChain).catch(() => {});
                    setOpen(false);
                  }}
                >
                  Switch to {targetChain.name}
                </button>
              )}
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800"
                onClick={() => {
                  navigator.clipboard?.writeText(String(evm.account ?? ''));
                  setOpen(false);
                }}
              >
                Copy address
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800"
                onClick={async () => {
                  await evm.disconnect().catch(() => {});
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
              {evm.wallets.length > 1 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-400">Change wallet</div>
                  {evm.wallets.map(w => (
                    <button
                      key={w.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 flex items-center gap-2"
                      onClick={async () => {
                        await evm.disconnect().catch(() => {});
                        evm.selectWallet(w.id);
                        await evm.connect();
                        setOpen(false);
                      }}
                    >
                      {w.icon ? <img src={w.icon} className="h-4 w-4 rounded" alt="" /> : <span>🦊</span>}
                      <span className="truncate">{w.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
