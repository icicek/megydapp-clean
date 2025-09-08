// components/TrustPledge.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';

type Props = { compact?: boolean };

export default function TrustPledge({ compact = true }: Props) {
  const items: { title: string; body: string }[] = [
    {
      title: 'Pool-Proportional Distribution',
      body:
        "Each phase’s MEGY pool is distributed proportionally to users’ USD contributions.",
    },
    {
      title: 'Floor Guard',
      body:
        'A phase’s USD/MEGY never falls below the previous phase. If contributions are low, partial distribution and rollover apply.',
    },
    {
      title: 'Market Independence',
      body:
        'Distribution is independent from external market price; resistant to manipulation.',
    },
    {
      title: 'Live Transparency',
      body:
        'Implied rate, full-unlock target, remaining pool, and participant counts are public.',
    },
    {
      title: 'Snapshot & Finalize',
      body:
        'At phase close, contributions are snapshotted and allocations are frozen for distribution.',
    },
    {
      title: 'Vesting (Optional)',
      body:
        'TGE + linear vesting can reduce immediate sell pressure.',
    },
    {
      title: 'Secure Governance',
      body:
        'Multisig, emergency kill-switch, audit logs, and traceable parameter changes.',
    },
    {
      title: 'Auditable Records',
      body:
        'USD values via TWAP/VWAP; regular metric reports published.',
    },
  ];

  // exactly one open at a time; default the first open
  const [openIdx, setOpenIdx] = useState<number>(0);

  const sectionClass =
    'w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 md:p-8 text-white';

  return (
    <section className={sectionClass}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-xl md:text-2xl font-semibold">Trust Pledge</h2>
        <Link
          href="/trust"
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-sm"
        >
          Learn more
        </Link>
      </div>

      {/* Intro */}
      <p className="text-sm text-zinc-400 mb-4">
        Coincarnation is designed for fairness and transparency. These principles are core to the protocol.
      </p>

      {/* Accordion (single column, only one open) */}
      <div className="space-y-3">
        {items.map((it, i) => {
          const isOpen = i === openIdx;
          const contentId = `trust-pledge-item-${i}`;
          return (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
            >
              {/* Header row */}
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={() => setOpenIdx(i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="font-medium">{it.title}</span>
                <ChevronRight className={`h-5 w-5 text-zinc-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              </button>

              {/* Content */}
              <div
                id={contentId}
                className={`${isOpen ? 'block' : 'hidden'} px-4 pb-4 text-sm text-zinc-300`}
              >
                {it.body}
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-4 text-xs text-zinc-500">
          Details and formulas are available at <Link className="underline" href="/trust">/trust</Link>.
        </div>
      )}
    </section>
  );
}

/* simple inline chevron icon (no external libs) */
function ChevronRight({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.293 4.293a1 1 0 011.414 0l4.999 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}
