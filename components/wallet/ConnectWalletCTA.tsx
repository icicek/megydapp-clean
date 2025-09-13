'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export default function ConnectWalletCTA() {
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const short = (k: string) => k.slice(0, 4) + '…' + k.slice(-4);

  if (publicKey) {
    return (
      <button
        onClick={() => disconnect()}
        className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
        aria-label="Disconnect wallet"
      >
        {short(publicKey.toBase58())} — Disconnect
      </button>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)} // modal’ı açar, seçimi WalletModal yönetir
      className="bg-indigo-600 hover:bg-indigo-700 rounded px-3 py-2 text-sm font-semibold"
      aria-label="Connect wallet"
    >
      Connect Wallet
    </button>
  );
}

/* 
// İstersen hızlı teşhis için geçici olarak şunu kullanabilirsin:
// import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
// export default function ConnectWalletCTA() { return <WalletMultiButton />; }
*/
