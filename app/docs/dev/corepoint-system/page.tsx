import React from "react";

export default function CorePointSystemPage() {
  return (
    <article className="prose prose-invert max-w-4xl mx-auto px-4 py-8">
      <p className="text-sm text-yellow-400">
        ⚠️ <strong>INTERNAL ONLY</strong> — CorePoint / PVC Scoring System Reference
      </p>

      <h1>💠 CorePoint Scoring System</h1>
      <p className="italic text-gray-400 mb-4">
        “Measure value, not volume.”
      </p>

      <h2>🎯 Purpose</h2>
      <p>
        The <strong>CorePoint</strong> system (PVC — Personal Value Currency)
        quantifies every participant’s contribution across Coincarnation,
        referrals, and social actions.
      </p>

      <h2>⚙️ Components</h2>
      <ul>
        <li><strong>Coincarnation contribution:</strong> USD × 10 = CorePoints</li>
        <li><strong>Referral:</strong> bonus per referred wallet</li>
        <li><strong>Share on X:</strong> +30 CP (once per wallet)</li>
        <li><strong>Deadcoin multiplier:</strong> USD=0 → ×1.2 bonus</li>
      </ul>

      <h2>📁 Files & Tables</h2>
      <ul>
        <li><code>components/ClaimPanel.js</code> — personal PVC display</li>
        <li><code>components/Leaderboard.tsx</code> — CorePoint ranking</li>
        <li><code>app/api/share/record/route.ts</code> — social share logging</li>
        <li><code>lib/corepoint/calc.ts</code> — scoring formulas</li>
        <li><code>lib/corepoint/utils.ts</code> — helpers</li>
        <li><code>participants</code>, <code>contributions</code>, <code>shares</code>, <code>referrals</code> tables</li>
      </ul>

      <h2>🧮 Example Formula</h2>
      <pre><code>{`corepoint = (usd_contributed * 10)
           + (referrals * 50)
           + (first_share ? 30 : 0)
           + (deadcoin_bonus ? usd_contributed * 2 : 0)`}</code></pre>

      <h2>🏆 Usage</h2>
      <ul>
        <li>Displayed on ClaimPanel as “Personal Value Currency”.</li>
        <li>Used in Leaderboard sorting.</li>
        <li>Will determine NFT rarity in future phases.</li>
      </ul>

      <h2>💡 Notes</h2>
      <ul>
        <li>Each wallet has unique CorePoint record.</li>
        <li>Scores update dynamically upon new Coincarnations, referrals, or shares.</li>
      </ul>
    </article>
  );
}
