import React from "react";

export default function ClaimFlowPage() {
  return (
    <article className="prose prose-invert max-w-4xl mx-auto px-4 py-8">
      <p className="text-sm text-yellow-400">
        ⚠️ <strong>INTERNAL ONLY</strong> — Claim logic & MEGY distribution reference.
      </p>

      <h1>💸 Claim Flow Engine</h1>
      <p className="italic text-gray-400 mb-4">
        “A fair share for every Coincarnator.”
      </p>

      <h2>🎯 Objective</h2>
      <p>
        The <strong>Claim Flow Engine</strong> manages how participants receive their earned
        <code>$MEGY</code> tokens once a Coincarnation cycle ends.
      </p>

      <h2>⚙️ Flow Steps</h2>
      <ol>
        <li><strong>Snapshot:</strong> Participants + contributions frozen at end of period.</li>
        <li><strong>Claim Toggle:</strong> Admin sets <code>claim_open=true</code>.</li>
        <li><strong>Claim Action:</strong> Users pay 0.5 USD in SOL → receive $MEGY.</li>
        <li><strong>Validation:</strong> One claim per wallet; recorded to Neon DB.</li>
      </ol>

      <h2>📁 Key Files</h2>
      <ul>
        <li><code>components/ClaimPanel.js</code> — Frontend UI & logic</li>
        <li><code>app/api/claim/[wallet]/route.ts</code> — User claim data fetch</li>
        <li><code>app/api/claim/submit/route.ts</code> — Claim submission endpoint</li>
        <li><code>lib/claim/feeTransfer.ts</code> — Handles SOL fee transaction</li>
      </ul>

      <h2>💾 Database Tables</h2>
      <ul>
        <li><code>claims</code> — wallet, amount, tx_signature, timestamp</li>
        <li><code>participants</code> — total_usd_contributed, user_id</li>
        <li><code>contributions</code> — per-token records</li>
      </ul>

      <h2>🧭 Logic Summary</h2>
      <pre><code>{`claim_open = true → user connects wallet
→ calculates share_ratio = user_total / global_total
→ user pays SOL fee
→ /api/claim/submit writes to Neon
→ "🎉 Claimed!" + OG image rendered`}</code></pre>

      <h2>💡 Notes</h2>
      <ul>
        <li>Fee wallet: <code>HPBNVF9ATsnkDhGmQB4xoLC5tWBWQbTyBjsiQAN3dYXH</code></li>
        <li>Claim verification prevents duplicate claims.</li>
        <li>Admin can re-close claim cycle at any time.</li>
      </ul>
    </article>
  );
}
