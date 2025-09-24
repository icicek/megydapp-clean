// components/wallet/ConnectBar.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import ConnectModal from '@/components/wallet/ConnectModal';

export default function ConnectBar() {
  const { connected, publicKey, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  const short = useMemo(() => {
    const a = publicKey?.toBase58();
    return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
  }, [publicKey]);

  async function handleCopy() {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey.toBase58());
  }

  return (
    <div className="flex items-center gap-2">
      {!connected ? (
        <>
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Select wallet
          </button>
          <ConnectModal open={open} onClose={() => setOpen(false)} />
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-80">SOL</span>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
            {short}
          </div>
          <button
            onClick={handleCopy}
            className="rounded-lg px-3 py-2 border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
          >
            Copy
          </button>
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg px-3 py-2 border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
          >
            Change wallet
          </button>
          <button
            onClick={() => disconnect().catch(() => {})}
            className="rounded-lg px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm"
          >
            Disconnect
          </button>
          <ConnectModal open={open} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
