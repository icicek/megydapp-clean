// app/docs/dev/layout.tsx
'use client';
import type { ReactNode } from 'react';

export default function DevDocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[60vh] px-4 py-6 text-white max-w-5xl mx-auto">
      {children}
    </div>
  );
}
