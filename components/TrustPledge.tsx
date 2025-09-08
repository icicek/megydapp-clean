// components/TrustPledge.tsx
'use client';

import { useState } from 'react';

type Props = { compact?: boolean };

export default function TrustPledge({ compact = true }: Props) {
  const items: { title: string; body: string }[] = [
    {
      title: 'Pool-Proportional Distribution',
      body: 'Each phase’s MEGY pool is distributed proportionally to users’ USD contributions.',
    },
    {
      title: 'Floor Guard',
      body:
        'A phase’s USD/MEGY never falls below the previous phase. If contributions are low, partial distribution and rollover apply.',
    },
    {
      title: 'Market Independence',
      body: 'Distribution is independent from external market price; resistant to manipulation.',
    },
    {
      title: 'Live Transparency',
      body: 'Implied rate, full-unlock target, remaining pool, and participant counts are public.',
    },
    {
      title: 'Snapshot & Finalize',
      body:
        'At phase close, contributions are snapshotted and allocations are frozen for distribution.',
    },
    {
      title: 'Vesting (Optional)',
      body: 'TGE + linear vesting can reduce immediate sell pressure.',
    },
    {
      title: 'Secure Governance',
      body:
        'Multisig, emergency kill-switch, audit logs, and traceable parameter changes.',
    },
    {
      title: 'Auditable Records',
      body: 'USD values via TWAP/VWAP; regular metric reports published.',
    },
  ];

  // start with all closed
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const container =
    'w-full rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm p-6 md:p-8 text-white';
  const itemBase =
    'rounded-lg border border-white/10 bg-white/5';
  const headerBtn =
    'w-full flex items-center justify-between px-4 py-3 text-left';
  const bodyCls =
    'px-4 pb-4 text-sm text-zinc-300';

  return (
    <section className={container}>
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-xl md:text-2xl font-semibold">Trust Pledge</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Coincarnation is designed for fairness and transparency. These principles are core to the protocol.
        </p>
      </div>

      {/* Accordion (single column, only one open; clicking open again collapses all) */}
      <div className="space-y-3">
        {items.map((it, i) => {
          const isOpen = i === openIdx;
          const contentId = `trust-pledge-item-${i}`;
          return (
            <div key={i} className={itemBase}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className={headerBtn}
              >
                <span className="font-medium">{it.title}</span>
                <ChevronRight
                  className={`h-5 w-5 text-zinc-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
              </button>
              <div id={contentId} className={`${isOpen ? 'block' : 'hidden'} ${bodyCls}`}>
                {it.body}
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-4 text-xs text-zinc-500">
          Details and formulas will be published with the whitepaper.
        </div>
      )}
    </section>
  );
}

function ChevronRight({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M7.293 4.293a1 1 0 011.414 0l4.999 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}
