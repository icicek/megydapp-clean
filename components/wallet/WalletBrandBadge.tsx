// components/wallet/WalletBrandBadge.tsx
'use client';

import React, { useState } from 'react';
import WalletBrandIcon, { Brand } from '@/components/wallet/WalletBrandIcon';

type Props = { brand: Brand; size?: number; className?: string };

export default function WalletBrandBadge({ brand, size = 20, className }: Props) {
  const [imgOk, setImgOk] = useState(true);

  // Önce SVG logo dene (public/logos/brand.svg). Yoksa fallback ikon.
  // ÖNEMLİ: Dinamik Tailwind sınıfı yerine width/height'ı style ile veriyoruz.
  if (imgOk) {
    const src = `/logos/${brand}.svg`;
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={`${brand} logo`}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={className}
        onError={() => setImgOk(false)}
      />
    );
  }

  return <WalletBrandIcon brand={brand} size={size} className={className} />;
}
