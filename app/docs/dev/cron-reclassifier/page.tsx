import React from "react";

export default function CronReclassifierPage() {
  return (
    <article className="prose prose-invert max-w-4xl mx-auto px-4 py-8">
      <p className="text-sm text-yellow-400">
        ⚠️ <strong>INTERNAL ONLY</strong> — Coincarnation Admin Automation Overview
      </p>

      <h1>⏱ Cron Reclassifier</h1>
      <p className="italic text-gray-400 mb-4">
        “When a token sleeps too long, we decide if it’s truly dead.”
      </p>

      <h2>🎯 Purpose</h2>
      <p>
        The <strong>Cron Reclassifier</strong> automatically updates token statuses from
        <code>healthy → walking_dead → deadcoin</code> based on their age and activity.
        It runs periodically via GitHub Actions to ensure registry accuracy.
      </p>

      <h2>⚙️ Workflow</h2>
      <ol>
        <li>GitHub Action triggers <code>POST /api/admin/reclassify</code> every 15 minutes.</li>
        <li>SQL-based batch logic updates token_registry according to defined thresholds.</li>
        <li>Each change is written into <code>token_audit</code> for traceability.</li>
        <li>PostgreSQL advisory locks prevent overlapping runs.</li>
      </ol>

      <h2>🔧 Environment Variables</h2>
      <pre><code>{`RECLASSIFIER_DEADCOIN_DAYS=30
RECLASSIFIER_MIN_AGE_MINUTES=30
RECLASSIFIER_COOLDOWN_HOURS=0.25
RECLASSIFIER_BATCH_SIZE=50`}</code></pre>

      <h2>📦 Key Files</h2>
      <ul>
        <li><code>.github/workflows/reclassify.yml</code> — Scheduled trigger</li>
        <li><code>app/api/admin/reclassify/route.ts</code> — Main logic endpoint</li>
        <li><code>lib/admin/reclassify.ts</code> — SQL + cooldown handler</li>
        <li><code>token_audit</code> / <code>cron_runs</code> tables — persistence & logs</li>
      </ul>

      <h2>📊 Data Tables</h2>
      <table className="text-sm border border-gray-800">
        <thead><tr><th>Column</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td>mint</td><td>Token address</td></tr>
          <tr><td>old_status</td><td>Previous classification</td></tr>
          <tr><td>new_status</td><td>New classification</td></tr>
          <tr><td>reason</td><td>Trigger or rule used</td></tr>
          <tr><td>ran_at</td><td>Timestamp</td></tr>
        </tbody>
      </table>

      <h2>💡 Notes</h2>
      <ul>
        <li>Ensures stale assets don’t stay marked as healthy.</li>
        <li>Only admin wallets can invoke manually.</li>
        <li>Audit history can be viewed under <code>/admin/audit</code>.</li>
      </ul>
    </article>
  );
}
