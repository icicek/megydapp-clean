// components/wallet/WalletBrandBadge.tsx
'use client';

import React, { useState } from 'react';
import WalletBrandIcon, { Brand } from '@/components/wallet/WalletBrandIcon';

type Props = { brand: Brand; size?: number; className?: string };

export default function WalletBrandBadge({ brand, size = 20, className }: Props) {
  const [imgOk, setImgOk] = useState(true);
  const src = `/logos/${brand}.svg`; // /public/logos/phantom.svg vb.

  // Eğer gerçek logo yoksa (404) → fallback ikon
  return imgOk ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt={`${brand} logo`}
      className={className}
      onError={() => setImgOk(false)}
    />
  ) : (
    <WalletBrandIcon brand={brand} className={className ?? `h-[${size}px] w-[${size}px]`} />
  );
}
