// components/wallet/WalletBrandIcon.tsx
'use client';

import React from 'react';

export type Brand = 'phantom' | 'solflare' | 'backpack' | 'walletconnect';

const COLORS: Record<Brand, string> = {
  phantom: '#AB9FF2',        // mor
  solflare: '#F46C19',       // turuncu
  backpack: '#FF4D4D',       // kırmızı
  walletconnect: '#3B99FC',  // mavi
};

const LETTER: Record<Brand, string> = {
  phantom: 'P',
  solflare: 'S',
  backpack: 'B',
  walletconnect: 'W',
};

export default function WalletBrandIcon({
  brand,
  className = 'h-5 w-5',
}: { brand: Brand; className?: string }) {
  const fill = COLORS[brand];
  const letter = LETTER[brand];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <radialGradient id={`g-${brand}`} cx="50%" cy="35%" r="80%">
          <stop offset="0%" stopOpacity="1" stopColor="#ffffff" />
          <stop offset="30%" stopOpacity="0.85" stopColor={fill} />
          <stop offset="100%" stopOpacity="1" stopColor={fill} />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#g-${brand})`} />
      <text
        x="12" y="15" textAnchor="middle"
        fontSize="11" fontWeight="700" fill="#0b0b0b" style={{letterSpacing: '0.5px'}}
      >
        {letter}
      </text>
    </svg>
  );
}
