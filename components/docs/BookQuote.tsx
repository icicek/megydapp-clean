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
    <figure className="group my-16 border-y border-white/10 py-9 md:my-20 md:py-12">
      <blockquote className="max-w-4xl text-lg font-medium leading-relaxed tracking-tight text-white/90 md:text-[26px] md:leading-[1.65]">
        {children}
      </blockquote>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/35 transition-all duration-300 hover:border-cyan-200/20 hover:text-cyan-100"
          aria-label="Copy quote"
        >
          {copied ? 'Copied' : 'Copy Quote'}
        </button>
      </div>
    </figure>
  );
}