// app/docs/dev/cron-reclassifier/page.tsx
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

export default function CronReclassifierPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <PageMeta
        title="⏱ Cron Reclassifier"
        desc="Automated status updates (healthy → walking_dead → deadcoin) with cooldown & audit."
      />
      <article className="prose prose-invert max-w-4xl mx-auto">
        <p className="text-sm text-yellow-400">
          ⚠️ <strong>INTERNAL ONLY</strong> — Admin automation overview
        </p>

        <h2>🎯 Purpose</h2>
        <p>
          Periodically reclassifies tokens by age/inactivity to keep <code>token_registry</code> fresh
          and aligned with policy.
        </p>

        <h2>⚙️ Workflow</h2>
        <ol>
          <li>GitHub Actions triggers <code>POST /api/admin/reclassify</code> every 15 minutes.</li>
          <li>SQL batch updates statuses based on thresholds & cooldown.</li>
          <li>Each change is appended to <code>token_audit</code>.</li>
          <li>Advisory locks prevent overlapping runs.</li>
        </ol>

        <h2>🔧 Environment</h2>
        <pre><code>{`RECLASSIFIER_DEADCOIN_DAYS=30
RECLASSIFIER_MIN_AGE_MINUTES=30
RECLASSIFIER_COOLDOWN_HOURS=0.25
RECLASSIFIER_BATCH_SIZE=50`}</code></pre>

        <h2>📦 Key Files</h2>
        <ul>
          <li><code>.github/workflows/reclassify.yml</code></li>
          <li><code>app/api/admin/reclassify/route.ts</code></li>
          <li><code>lib/admin/reclassify.ts</code></li>
          <li><code>token_audit</code> & <code>cron_runs</code> tables</li>
        </ul>

        <h2>📊 token_audit Columns</h2>
        <table>
          <thead><tr><th>Column</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td>mint</td><td>Token address</td></tr>
            <tr><td>old_status</td><td>Previous classification</td></tr>
            <tr><td>new_status</td><td>New classification</td></tr>
            <tr><td>price</td><td>Optional snapshot</td></tr>
            <tr><td>reason</td><td>Rule/trigger</td></tr>
            <tr><td>ran_at</td><td>Timestamp</td></tr>
          </tbody>
        </table>

        <p className="mt-6">
          <Link href="/docs/dev" className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100">
            ← Back to Dev Notes
          </Link>
        </p>
      </article>
    </div>
  );
}
