//components/docs/BookQuote.tsx

'use client';

import { ReactNode, useMemo, useState } from 'react';

type BookQuoteProps = {
    children: ReactNode;
};

function extractText(node: ReactNode): string {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    return '';
}

export default function BookQuote({ children }: BookQuoteProps) {
    const [copied, setCopied] = useState(false);

    const quoteText = useMemo(() => extractText(children).trim(), [children]);

    const handleCopy = async () => {
        const source =
            typeof window !== 'undefined'
                ? `\n\n— Levershare Essays\n${window.location.href}`
                : '';

        try {
            await navigator.clipboard.writeText(`${quoteText}${source}`);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setCopied(false);
        }
    };

    return (
        <figure className="group my-16 border-y border-white/10 py-9 md:my-20 md:py-12">
            <blockquote className="max-w-4xl text-lg font-medium leading-relaxed tracking-tight text-white/90 md:text-[26px] md:leading-[1.65]">
                {children}
            </blockquote>

            <div className="mt-5 flex justify-end">
                <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 transition-all duration-300 hover:border-cyan-200/25 hover:text-cyan-100"
                    aria-label="Copy quote"
                >
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                    <span className={copied ? 'text-cyan-200' : 'text-white/25'}>
                        {copied ? '✓' : '↗'}
                    </span>
                </button>
            </div>
        </figure>
    );
}