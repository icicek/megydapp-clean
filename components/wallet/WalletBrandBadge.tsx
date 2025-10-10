// components/wallet/WalletBrandBadge.tsx
'use client';

import React, { useEffect, useState } from 'react';
import WalletBrandIcon, { Brand } from '@/components/wallet/WalletBrandIcon';

type Props = {
  brand: Brand;
  size?: number;
  className?: string;
  /** (Opsiyonel) Adapter’dan gelen icon (genelde data URL). Varsa önce bu kullanılır. */
  iconSrc?: string;
};

export default function WalletBrandBadge({
  brand,
  size = 20,
  className,
  iconSrc,
}: Props) {
  // adapter icon → public/logos → inline fallback
  const [mode, setMode] = useState<'adapter' | 'file' | 'fallback'>(iconSrc ? 'adapter' : 'file');

  useEffect(() => {
    setMode(iconSrc ? 'adapter' : 'file');
  }, [iconSrc, brand]);

  if (mode === 'adapter' && iconSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconSrc}
        alt={`${brand} logo`}
        width={size}
        height={size}
        style={{ width: size, height: size, display: 'block' }}
        className={className}
        draggable={false}
        decoding="async"
        loading="eager"
        onError={() => setMode('file')}
      />
    );
  }

  if (mode === 'file') {
    const src = `/logos/${brand}.svg`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${brand} logo`}
        width={size}
        height={size}
        style={{ width: size, height: size, display: 'block' }}
        className={className}
        draggable={false}
        decoding="async"
        loading="eager"
        onError={() => setMode('fallback')}
      />
    );
  }

  // Son çare: inline ikon (her zaman çalışır)
  return <WalletBrandIcon brand={brand} size={size} className={className} />;
}
