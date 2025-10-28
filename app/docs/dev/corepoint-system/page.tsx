// app/docs/dev/corepoint-system/page.tsx
'use client';
import React from 'react';
import Link from 'next/link';

function PageMeta({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs text-white/60">Internal Docs</div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {desc && <p className="text-white/70 mt-1">{desc}</p>}
      <hr className="mt-3 border-white/10" />
    </div>
  );
}

export default function CorepointSystemPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <PageMeta
        title="🏆 CorePoint Scoring System"
        desc="Personal Value Currency (PVC) points — contributions, referrals, shares, deadcoin bonuses."
      />

      <article className="prose prose-invert max-w-4xl mx-auto">
        <p className="text-sm text-yellow-400">
          ⚠️ <strong>INTERNAL ONLY</strong> — PVC/CorePoint design
        </p>

        <h2>🎯 Goal</h2>
        <p>
          Reward users for ecosystem-positive actions. CorePoint influences ranks, perks, and future PVC/NFT utilities.
        </p>

        <h2>📐 Scoring (initial)</h2>
        <ul>
          <li>Coincarnation contribution: proportional to USD value</li>
          <li>Referrals: weighted by referees’ contributions</li>
          <li>Shares (X/Twitter): one-time <strong>+30</strong> per wallet (first click only)</li>
          <li>Deadcoin detection: bonus multiplier for verified zero-USD assets</li>
        </ul>

        <h2>🔄 Flow</h2>
        <ol>
          <li>Actions hit API (<code>/api/ogdata</code>, <code>/api/share/record</code>, etc.)</li>
          <li>Server computes deltas → updates <code>participants</code>/<code>contributions</code>/<code>corepoints</code></li>
          <li>Leaderboard reads aggregated view</li>
          <li>UI caches w/ SWR; invalidates on action</li>
        </ol>

        <h2>📦 Key Files</h2>
        <ul>
          <li><code>components/ClaimPanel.js</code> — CorePoint box</li>
          <li><code>components/Leaderboard.tsx</code> — rank table + “Share your rank”</li>
          <li><code>app/api/share/record/route.ts</code> — one-time share credit</li>
          <li><code>db: corepoints</code> or materialized view for totals</li>
        </ul>

        <h2>🛡️ Guards</h2>
        <ul>
          <li>One-time share reward per wallet (idempotent key)</li>
          <li>Referral self-credit prevention; wallet-scoped checks</li>
          <li>Deadcoin verification via registry/rules to avoid gaming</li>
        </ul>

        <p className="mt-6">
          <Link href="/docs/dev" className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100">
            ← Back to Dev Notes
          </Link>
        </p>
      </article>
    </div>
  );
}
