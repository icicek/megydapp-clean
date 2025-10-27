// components/admin/DevNotesButton.tsx
'use client';

import Link from 'next/link';

export default function DevNotesButton() {
  return (
    <Link
      href="/docs/dev"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10
                 bg-white/5 hover:bg-white/10 transition-colors text-sm"
      title="Developer notes / internal docs"
    >
      <span>📘</span>
      <span>Dev Notes</span>
    </Link>
  );
}
