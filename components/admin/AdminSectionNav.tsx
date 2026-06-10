//AdminSectionNav.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import DevNotesButton from '@/components/admin/DevNotesButton';

const items = [
  { href: '/', label: 'Home' },
  { href: '/admin', label: 'Tokens' },
  { href: '/admin/control', label: 'Control' },
  { href: '/admin/phases', label: 'Phases' },
  { href: '/admin/phase-review', label: 'Phase Review' },
  { href: '/admin/refunds', label: 'Refunds' },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navBtn =
  'rounded-xl px-4 py-2 text-sm font-semibold transition';

export default function AdminSectionNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      router.replace('/admin/login');
    }
  }

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-zinc-900/70 backdrop-blur-md p-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <button
                key={item.href}
                type="button"
                onClick={() => {
                  if (pathname !== item.href) {
                    router.push(item.href);
                  }
                }}
                className={[
                  navBtn,
                  active
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10',
                ].join(' ')}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {pathname === '/admin' && (
            <button
              type="button"
              onClick={() => router.push('/admin/audit')}
              className={`${navBtn} bg-white/5 text-white hover:bg-white/10 border border-white/10`}
            >
              Audit Log
            </button>
          )}

          <DevNotesButton />

          <button
            type="button"
            onClick={logout}
            className={`${navBtn} bg-white/5 text-white hover:bg-white/10 border border-white/10`}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}