'use client';

import { useEffect } from 'react';

export default function PagerHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        (document.getElementById('pager-prev') as HTMLAnchorElement | null)?.click();
      } else if (e.key === 'ArrowRight') {
        (document.getElementById('pager-next') as HTMLAnchorElement | null)?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return null; // görünür bir şey render etmiyoruz
}
