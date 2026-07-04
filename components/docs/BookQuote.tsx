//components/docs/BookQuote.tsx

'use client';

import { ReactNode, useState } from 'react';

type BookQuoteProps = {
  children: ReactNode;
};

export default function BookQuote({ children }: BookQuoteProps) {
  const [copied, setCopied] = useState(false);

  const getText = (node: ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getText).join('');
    return '';
  };

  const handleCopy = async () => {
    const text = getText(children).trim();

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className="group my-10 border-y border-white/10 py-7 md:my-12 md:py-9">
      <blockquote className="text-xl font-semibold leading-relaxed tracking-tight text-white md:text-2xl md:leading-relaxed">
        {children}
      </blockquote>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45 transition hover:border-cyan-300/30 hover:text-cyan-100"
          aria-label="Copy quote"
        >
          {copied ? 'Copied' : 'Copy Quote'}
        </button>
      </div>
    </figure>
  );
}