import React from "react";

export default function TokenlistIntelligenceSystemPage() {
  return (
    <article className="prose prose-invert max-w-4xl mx-auto px-4 py-8">
      <p className="text-sm text-yellow-400">
        ⚠️ <strong>INTERNAL ONLY</strong> — Accessible only to authorized admin wallets via the Coincarnation Admin Panel.
      </p>

      <h1>🧭 Tokenlist Intelligence System</h1>
      <p className="italic text-gray-400 mb-4">
        “From chaos to clarity — one mint at a time.”
      </p>

      <table className="text-sm border border-gray-800">
        <tbody>
          <tr><td className="font-semibold pr-4">Project</td><td>Coincarnation DApp</td></tr>
          <tr><td className="font-semibold pr-4">Module</td><td>Tokenlist &amp; Metadata Resolver</td></tr>
          <tr><td className="font-semibold pr-4">Last Updated</td><td>2025-10-24</td></tr>
          <tr><td className="font-semibold pr-4">Maintainer</td><td>Levershare Dev Core</td></tr>
        </tbody>
      </table>

      <h2>🌐 Overview</h2>
      <p>
        The <strong>Tokenlist Intelligence System</strong> ensures every token shown inside Coincarnation
        carries its correct <strong>symbol</strong>, <strong>name</strong>, and <strong>logo</strong>, even when standard APIs fail.
        It blends curated tokenlists (Jupiter), on-chain metadata, and DEX intelligence (Dexscreener) to identify
        living, walking-dead, and lost assets on Solana.
      </p>

      <h2>⚙️ System Map</h2>
      <pre><code>{`app/api/tokenlist/route.ts        ← global list fetcher (Jupiter strict)
app/api/symbol/route.ts           ← single-mint resolver
app/api/solana/tokens/route.ts    ← server-side wallet token enumerator
lib/solana/tokenMeta.ts           ← universal metadata resolver
lib/utils.ts                      ← helpers
lib/client/fetchTokenMetadataClient.ts ← Metaplex metadata client
hooks/useWalletTokens.ts          ← wallet token enrichment hook
components/HomePage.tsx           ← token dropdown (logos)
components/CoincarneModal.tsx     ← token.symbol/logo during Coincarnation
`}</code></pre>

      <blockquote>
        <p><strong>Priority rule:</strong></p>
        <ol>
          <li>/api/tokenlist symbol/name/logo <strong>wins</strong>.</li>
          <li>On-chain/meta <strong>fills missing fields</strong>.</li>
          <li>As last resort → show <strong>mint prefix</strong> (UI fallback).</li>
        </ol>
      </blockquote>

      <h2>🔄 Data Flow</h2>
      <pre><code>{`A[Wallet] → /api/solana/tokens → useWalletTokens Hook
→ enrich → /api/tokenlist/
→ has meta? → yes → UI uses symbol/logo
→ no → getTokenMeta()/api/symbol fallback
→ CoincarneModal + HomePage
`}</code></pre>

      <h3>Responsibilities</h3>
      <ul>
        <li><code>app/api/tokenlist/route.ts</code> — Fetches <em>https://tokens.jup.ag/strict</em> (primary source).</li>
        <li><code>app/api/symbol/route.ts</code> — Isolated mint checks.</li>
        <li><code>lib/solana/tokenMeta.ts</code> — Merges tokenlist + fallback providers.</li>
        <li><code>hooks/useWalletTokens.ts</code> — Lists SPL tokens and enriches metadata.</li>
        <li><code>components/HomePage.tsx</code> &amp; <code>CoincarneModal.tsx</code> — UI display layers.</li>
      </ul>

      <h2>💥 Troubleshooting</h2>
      <table className="text-sm border border-gray-800">
        <thead>
          <tr><th>Symptom</th><th>Likely cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr><td>All symbols random</td><td>/api/tokenlist failing</td><td>Check <code>route.ts</code></td></tr>
          <tr><td>Only SOL visible</td><td>Token list empty</td><td>Inspect <code>/api/solana/tokens</code></td></tr>
          <tr><td>Wrong symbol (POPCAT→ZN)</td><td>On-chain override</td><td>Fix precedence in <code>tokenMeta.ts</code></td></tr>
          <tr><td>Logos missing</td><td>No <code>logoURI</code></td><td>Add fallback in <code>tokenMeta.ts</code></td></tr>
        </tbody>
      </table>

      <h2>🧩 Operational Notes</h2>
      <ul>
        <li>Keep this doc internal (not served from <code>/public</code>).</li>
        <li>Use server-side routes to bypass RPC rate limits.</li>
        <li>Maintain fallback tokenlist for resiliency.</li>
      </ul>

      <h2>💫 Vision</h2>
      <blockquote>
        “A token without a name is just lost code. Coincarnation gives it back its identity.”
      </blockquote>
    </article>
  );
}
