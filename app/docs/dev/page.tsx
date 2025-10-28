'use client';

import Link from 'next/link';

const TB = "inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm whitespace-nowrap";

const devLinks = [
  { href: '/docs/dev/tokenlist-intelligence-system', label: 'Tokenlist Intelligence System', emoji: '🧠' },
  { href: '/docs/dev/cron-reclassifier',             label: 'Cron / Reclassifier',          emoji: '⏱️' },
  { href: '/docs/dev/claim-flow',                    label: 'Claim Flow',                   emoji: '📄' },
  { href: '/docs/dev/corepoint-system',              label: 'CorePoint System',             emoji: '🏆' },
];

export default function DevNotesHome() {
  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">📘 Developer Notes</h1>
        <Link href="/admin/tokens" className={TB} title="Back to Tokens">
          <span>↩︎</span><span>Back to Tokens</span>
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {devLinks.map((l) => (
          <Link key={l.href} href={l.href} className={TB}>
            <span>{l.emoji}</span>
            <span className="truncate">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
