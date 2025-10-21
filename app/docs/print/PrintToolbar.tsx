'use client';

import Link from "next/link";

export default function PrintToolbar() {
  return (
    <div className="no-print sticky top-0 z-20 -mx-6 -mt-8 px-6 py-3 bg-white/90 backdrop-blur border-b border-black/10 flex items-center gap-3">
      <button
        onClick={() => window.print()}
        className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium hover:bg-black/5"
      >
        Print PDF
      </button>
      <Link
        href="/docs"
        className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium hover:bg-black/5"
      >
        ← Back to Sections
      </Link>
    </div>
  );
}
