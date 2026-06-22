//app/docs/components/InsightQuote.tsx

'use client';

import { useState } from 'react';

export default function InsightQuote({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="group relative inline-flex max-w-full rounded-full border border-cyan-300/20 bg-black/20 px-4 py-2 text-left text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
      title="Copy"
    >
      <span>{children}</span>

      <span className="pointer-events-none absolute -right-2 -top-3 rounded-full border border-white/10 bg-zinc-950 px-2 py-0.5 text-[10px] font-semibold text-white/70 opacity-0 shadow-lg transition group-hover:opacity-100">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}