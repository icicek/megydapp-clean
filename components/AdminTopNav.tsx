// components/AdminTopNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/admin/tokens', label: 'Tokens' },
  { href: '/admin/control', label: 'Control' },
];

export default function AdminTopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 bg-black/90 backdrop-blur border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-2 flex gap-2">
        {tabs.map((t) => {
          const active = pathname?.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={[
                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                active
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/[0.04] hover:bg-white/10 border-white/10 text-gray-200',
              ].join(' ')}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
