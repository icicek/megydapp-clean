// components/AdminTopNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// küçük yardımcı: truthy class'ları birleştirir
function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function AdminTopNav() {
  const pathname = usePathname();

  // Yalnızca /admin altında (ama /admin/login hariç) göster
  if (!pathname?.startsWith('/admin') || pathname === '/admin/login') return null;

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + '/');
  const base = 'px-2 py-1 rounded hover:bg-gray-100';

  return (
    <nav className="border-b px-4 py-2 flex gap-4 text-sm bg-white/80 backdrop-blur">
      <Link
        href="/admin/tokens"
        className={cx(base, isActive('/admin/tokens') && 'bg-gray-200 font-medium')}
      >
        Tokens
      </Link>
      <Link
        href="/admin/control"
        className={cx(base, isActive('/admin/control') && 'bg-gray-200 font-medium')}
      >
        Control
      </Link>
    </nav>
  );
}
