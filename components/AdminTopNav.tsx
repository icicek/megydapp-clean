// components/AdminTopNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

export default function AdminTopNav() {
  const pathname = usePathname();

  // Sadece /admin altında ve /admin/login HARİÇ göster
  if (!pathname?.startsWith('/admin') || pathname === '/admin/login') return null;

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + '/');

  return (
    <nav className="border-b px-4 py-2 flex gap-4 text-sm bg-white/80 backdrop-blur">
      <Link
        href="/admin/tokens"
        className={clsx(
          'px-2 py-1 rounded hover:bg-gray-100',
          isActive('/admin/tokens') && 'bg-gray-200 font-medium'
        )}
      >
        Tokens
      </Link>
      <Link
        href="/admin/control"
        className={clsx(
          'px-2 py-1 rounded hover:bg-gray-100',
          isActive('/admin/control') && 'bg-gray-200 font-medium'
        )}
      >
        Control
      </Link>
    </nav>
  );
}
