//AdminSectionNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'Home' },
  { href: '/admin', label: 'Tokens' },
  { href: '/admin/control', label: 'Control' },
  { href: '/admin/phases', label: 'Phases' },
  { href: '/admin/refunds', label: 'Refunds' },
];

function isActive(pathname: string, href: string) {
    if (href === '/') return pathname === '/';
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSectionNav() {
  const pathname = usePathname();

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-zinc-900/70 backdrop-blur-md p-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold transition',
                active
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-white hover:bg-white/10 border border-white/10',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}