// components/AdminTopNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TB =
  'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ' +
  'border transition-colors whitespace-nowrap ' +
  'bg-white/[0.04] hover:bg-white/10 border-white/10 text-gray-200';

type Tab = { href: string; label: string; emoji?: string };

const tabs: Tab[] = [
  { href: '/admin/tokens',  label: 'Tokens',   emoji: '🛡️' },
  { href: '/admin/control', label: 'Control',  emoji: '🧩' },
  { href: '/docs/dev',      label: 'Dev Notes', emoji: '📘' },
];

export default function AdminTopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 bg-black/90 backdrop-blur border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
        {/* Left: tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {tabs.map((t) => {
            const active = pathname?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={[
                  TB,
                  active ? 'bg-white/10 border-white/20 text-white' : '',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
                title={t.label}
              >
                {t.emoji && <span>{t.emoji}</span>}
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right: back to site */}
        <div className="ml-auto">
          <Link href="/" className={TB} title="Back to site">
            <span>↩︎</span>
            <span>Back</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
