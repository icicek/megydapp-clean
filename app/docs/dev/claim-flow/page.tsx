// app/docs/dev/claim-flow/page.tsx
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

export default function ClaimFlowPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <PageMeta
        title="📄 Claim Flow Engine"
        desc="Claimable MEGY distribution, SOL-fee, toggles, snapshot and safety guards."
      />

      <article className="prose prose-invert max-w-4xl mx-auto">
        <p className="text-sm text-yellow-400">
          ⚠️ <strong>INTERNAL ONLY</strong> — Claim logic for participants
        </p>

        <h2>🎯 Scope</h2>
        <ul>
          <li>Proportional distribution after dual trigger (pool min USD + time window)</li>
          <li>Self-serve claim with optional <strong>partial</strong> claim support</li>
          <li><strong>$0.5 USD in SOL</strong> claim fee sent to treasury</li>
          <li>Admin toggle: <code>claim_open</code></li>
          <li>One-time claim per snapshot wallet (re-entrancy guard)</li>
        </ul>

        <h2>🔄 Flow</h2>
        <ol>
          <li>Snapshot finalized → amounts computed per wallet</li>
          <li>User opens Claim Panel → sees allocation & fee notice</li>
          <li>On submit: fee transfer to treasury, then MEGY mint/transfer</li>
          <li>DB writes: claims table append + idempotency key</li>
          <li>UI disables claim button for already-claimed wallets</li>
        </ol>

        <h2>📦 Key Files</h2>
        <ul>
          <li><code>components/ClaimPanel.js</code> — UI + client logic</li>
          <li><code>app/api/claim/route.ts</code> — server action (fee + mint/transfer)</li>
          <li><code>lib/claim/alloc.ts</code> — allocation math & snapshot helpers</li>
          <li><code>db: claims</code> — append-only proof of claim</li>
        </ul>

        <h2>🛡️ Guards</h2>
        <ul>
          <li>Check <code>claim_open</code> feature flag</li>
          <li>Fee received (on-chain) before payout</li>
          <li>Idempotency: per-wallet unique key (and/or tx signature)</li>
          <li>Already-claimed → 409</li>
        </ul>

        <h2>🔧 Env / Config</h2>
        <pre><code>{`TREASURY_SOL_WALLET=HPBNVF9ATsnkDhGmQB4xoLC5tWBWQbTyBjsiQAN3dYXH
CLAIM_FEE_USD=0.5
CLAIM_OPEN=true`}</code></pre>

        <p className="mt-6">
          <Link href="/docs/dev" className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100">
            ← Back to Dev Notes
          </Link>
        </p>
      </article>
    </div>
  );
}
