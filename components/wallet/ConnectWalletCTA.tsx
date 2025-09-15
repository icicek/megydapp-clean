'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export default function ConnectWalletCTA() {
  const { publicKey, disconnect, wallet, connecting, connected, connect } = useWallet();
  const { setVisible } = useWalletModal();

  // Kullanıcı modalı AÇTIĞINDA bir seçim yaparsa, seçimden sonra otomatik connect et
  const selectionPendingRef = useRef(false);

  const short = (k: string) => k.slice(0, 4) + '…' + k.slice(-4);

  // Modal üzerinden yeni bir cüzdan SEÇİLDİĞİNDE tetiklenir
  useEffect(() => {
    // selectionPendingRef => modalı biz açtıysak true
    if (selectionPendingRef.current && wallet && !connected && !connecting) {
      (async () => {
        try {
          await connect();       // seçer seçmez bağlan
          setVisible(false);     // modalı kapat (gerekirse)
        } catch {
          // kullanıcı iptal vs. — sessiz geç
        } finally {
          selectionPendingRef.current = false; // bayrağı sıfırla
        }
      })();
    }
  }, [wallet, connected, connecting, connect, setVisible]);

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
      onClick={() => {
        // Modalı BİZ açtığımız için, sonrasındaki seçim otomatik connect tetiklesin
        selectionPendingRef.current = true;
        setVisible(true);
      }}
      className="bg-indigo-600 hover:bg-indigo-700 rounded px-3 py-2 text-sm font-semibold"
      aria-label="Connect wallet"
    >
      Connect Wallet
    </button>
  );
}
