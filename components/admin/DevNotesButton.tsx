// components/admin/DevNotesButton.tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export default function DevNotesButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Kapama: dışarı tık, Escape
  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>📘</span>
        <span>Dev Notes</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-lg border border-white/10 bg-black/80 backdrop-blur p-2 shadow-xl z-50"
        >
          <ul className="text-sm">
            <MenuItem href="/docs/dev">📚 All Dev Docs</MenuItem>
            <MenuItem href="/docs/dev/claim-flow">🪙 Claim Flow</MenuItem>
            <MenuItem href="/docs/dev/corepoint-system">🏆 CorePoint System</MenuItem>
            <MenuItem href="/docs/dev/token-classification">🧪 Token Classification</MenuItem>
          </ul>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded px-3 py-2 hover:bg-white/10 focus:bg-white/10 focus:outline-none"
      >
        {children}
      </Link>
    </li>
  );
}
