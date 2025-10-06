// components/wallet/WalletBrandIcon.tsx
'use client';

import React from 'react';

export type Brand = 'phantom' | 'solflare' | 'backpack' | 'walletconnect';

const COLORS: Record<Brand, string> = {
  phantom: '#8b5cf6',
  solflare: '#f97316',
  backpack: '#ef4444',
  walletconnect: '#3b82f6',
};

export default function WalletBrandIcon({
  brand,
  size = 20,
  className,
}: {
  brand: Brand;
  size?: number;
  className?: string;
}) {
  const bg = COLORS[brand];
  const letter =
    brand === 'walletconnect' ? 'W' :
    brand === 'solflare' ? 'S' :
    brand === 'backpack' ? 'B' : 'P';

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient id={`g-${brand}`} cx="30%" cy="20%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor={bg} stopOpacity="1" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#g-${brand})`} />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="#111"
      >
        {letter}
      </text>
    </svg>
  );
}
