'use client';

import React from 'react';
import { useWalletHub, WalletBrand } from '@/app/providers/WalletHub';

type CardProps = {
  brand: WalletBrand;
  title: string;
  subtitle?: string;
  installedBadge?: boolean;
  onClick: () => void;
};

function WalletCard({ brand, title, subtitle, installedBadge, onClick }: CardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors
                 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center text-lg">
          {title[0]}
        </div>
        <div>
          <div className="font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
        </div>
      </div>
      {installedBadge && (
        <span className="text-[10px] px-2 py-1 rounded bg-green-600/70 border border-green-400/50">
          Installed
        </span>
      )}
    </button>
  );
}

export default function ConnectModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const hub = useWalletHub();

  // Basit EIP-6963 “installed” tespiti (masaüstünde varsa bonus rozet)
  const hasEthereum = typeof window !== 'undefined' && (window as any).ethereum;
  const isInstalled = (brand: WalletBrand) => {
    if (!hasEthereum) return false;
    // Minimal sezgi: MetaMask/Rabby/Trust için window.ethereum varlığı yeterli.
    return brand === 'metamask' || brand === 'rabby' || brand === 'trust';
  };

  const connect = async (brand: WalletBrand) => {
    try {
      await hub.connect(brand);
      onClose();
    } catch (e) {
      console.error('connect error:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute inset-x-0 top-10 mx-auto w-full max-w-md p-1">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600/40 via-fuchsia-700/20 to-purple-700/40 p-[1px]">
          <div className="rounded-2xl bg-black/85 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Connect a Wallet</h3>
              <button
                onClick={onClose}
                className="text-sm px-2 py-1 rounded border border-white/10 hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {/* Solana markaları: mevcut modal akışını tetikler */}
              <WalletCard
                brand="phantom"
                title="Phantom (Solana)"
                subtitle="Opens your Solana modal"
                onClick={() => connect('phantom')}
              />
              <WalletCard
                brand="solflare"
                title="Solflare (Solana)"
                subtitle="Opens your Solana modal"
                onClick={() => connect('solflare')}
              />
              <WalletCard
                brand="backpack"
                title="Backpack (Solana)"
                subtitle="Opens your Solana modal"
                onClick={() => connect('backpack')}
              />

              <div className="h-[1px] my-2 bg-white/10" />

              {/* EVM markaları */}
              <WalletCard
                brand="metamask"
                title="MetaMask"
                subtitle="Connect to EVM networks"
                installedBadge={isInstalled('metamask')}
                onClick={() => connect('metamask')}
              />
              <WalletCard
                brand="rabby"
                title="Rabby"
                subtitle="Connect to EVM networks"
                installedBadge={isInstalled('rabby')}
                onClick={() => connect('rabby')}
              />
              <WalletCard
                brand="trust"
                title="Trust Wallet"
                subtitle="Connect to EVM networks"
                installedBadge={isInstalled('trust')}
                onClick={() => connect('trust')}
              />

              <WalletCard
                brand="walletconnect"
                title="WalletConnect (QR / Deep Link)"
                subtitle="Mobile-friendly (coming next step)"
                onClick={() => connect('walletconnect')}
              />
            </div>

            <p className="text-[11px] text-gray-400 mt-3">
              By connecting, you agree to the Terms. Never share your seed phrase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
