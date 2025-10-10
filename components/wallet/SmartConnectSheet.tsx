// components/wallet/SmartConnectSheet.tsx
'use client';
import React from 'react';
import { phantomBrowseLink, solflareBrowseLink, backpackBrowseLink } from '@/lib/wallet/deeplinks';

type Props = {
  open: boolean;
  onClose: () => void;
  fallbackUrl?: string; // genelde location.href
};

export default function SmartConnectSheet({ open, onClose, fallbackUrl = typeof window !== 'undefined' ? window.location.href : '' }: Props) {
  if (!open) return null;

  const openLink = (href: string) => {
    // navigation must be user-gesture initiated (buton içinde zaten öyle)
    window.location.href = href;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fallbackUrl);
      alert('Link kopyalandı (kullanmak için cüzdan tarayıcısına yapıştırın).');
    } catch {
      // fallback
      prompt('Kopyala link:', fallbackUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white rounded-t-lg p-4 shadow-lg">
        <h3 className="text-lg font-semibold">Cüzdan ile aç</h3>
        <p className="text-sm text-gray-600 mt-1">Tarayıcınız cüzdanı injekte etmiyor. Dapp'i cüzdanınızın gömülü tarayıcısında açmayı deneyin.</p>

        <div className="mt-4 grid gap-2">
          <button
            className="w-full rounded-md py-3 border font-medium"
            onClick={() => openLink(phantomBrowseLink(fallbackUrl))}
          >
            Open in Phantom
          </button>

          <button
            className="w-full rounded-md py-3 border font-medium"
            onClick={() => openLink(solflareBrowseLink(fallbackUrl))}
          >
            Open in Solflare
          </button>

          <button
            className="w-full rounded-md py-3 border font-medium"
            onClick={() => openLink(backpackBrowseLink(fallbackUrl))}
          >
            Open in Backpack
          </button>

          <button
            className="w-full rounded-md py-3 bg-gray-100 border font-medium"
            onClick={() => {
              // WalletConnect fallback: open WalletConnect modal veya deeplink flow
              // Bu komponent yalnızca UI; asıl WalletConnect trigger'ı ConnectModal içinde ele alınmalı
              // Yine de kullanıcıyı bilgilendir:
              alert('Diğer cüzdanlar için "Other wallets" seçeneğini kullanın.');
            }}
          >
            Other wallets (WalletConnect)
          </button>

          <div className="flex gap-2 mt-2">
            <button className="flex-1 py-2 border rounded" onClick={copyLink}>Copy link</button>
            <button className="flex-1 py-2 border rounded" onClick={onClose}>Cancel</button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-3">Not: Eğer cihazınızda cüzdan injekte ediliyorsa (ör. Phantom mobil tarayıcı) otomatik yönlendirme gerekmez; normal Connect akışı kullanılacaktır.</p>
      </div>
    </div>
  );
}
