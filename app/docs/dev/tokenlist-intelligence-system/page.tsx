// app/docs/dev/tokenlist-intelligence-system/page.tsx
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

export default function TokenlistIntelligencePage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <PageMeta
        title="🧠 Tokenlist Intelligence System"
        desc="Symbol / name / logo unification — UI stays correct even if providers fail."
      />

      <article className="prose prose-invert max-w-4xl mx-auto">
        <p className="text-sm text-yellow-400">
          ⚠️ <strong>INTERNAL ONLY</strong> — Metadata resolution & UI consistency pipeline
        </p>

        <h2>🎯 Purpose</h2>
        <p>
          <strong>Tokenlist Intelligence System (TIS)</strong> guarantees correct{' '}
          <code>symbol / name / logo</code> for every SPL token in the app. Priority:
        </p>
        <ol>
          <li><code>/api/tokenlist</code> (Jupiter strict) — authoritative</li>
          <li>Fill missing fields via on-chain/Dex intelligence fallback</li>
          <li>Last resort: short mint prefix for a safe UI placeholder</li>
        </ol>

        <h2>🔄 Data Flow</h2>
        <pre><code>{`Wallet → /api/solana/tokens → useWalletTokens (hook)
           ↘ enrich with /api/tokenlist
              ↘ resolve gaps via lib/solana/tokenMeta
                 ↘ UI (HomePage dropdown, CoincarneModal, etc.)`}</code></pre>

        <h2>🗂️ Key Files (file → role)</h2>
        <ul>
          <li><code>app/api/tokenlist/route.ts</code> — Jupiter strict fetch → map {`{mint → {symbol,name,logoURI}}`}</li>
          <li><code>app/api/symbol/route.ts</code> — single-mint resolver (debug/monitoring)</li>
          <li><code>app/api/solana/tokens/route.ts</code> — server-side wallet token enumerator</li>
          <li><code>lib/solana/tokenMeta.ts</code> — merge/fallback + sanitation</li>
          <li><code>lib/utils.ts</code> — helpers (<code>fetchSolanaTokenList()</code>)</li>
          <li><code>hooks/useWalletTokens.ts</code> — list + enrich</li>
          <li><code>components/HomePage.tsx</code> — dropdown with logo/symbol</li>
          <li><code>components/CoincarneModal.tsx</code> — <code>displaySymbol</code> usage during confirmations</li>
        </ul>

        <h2>💥 Troubleshooting</h2>
        <table>
          <thead><tr><th>Symptom</th><th>Likely cause</th><th>Check first</th></tr></thead>
          <tbody>
            <tr><td>All non-SOL look random</td><td><code>/api/tokenlist</code> empty/failed</td><td><code>app/api/tokenlist/route.ts</code></td></tr>
            <tr><td>Only SOL appears</td><td>Wallet listings empty</td><td><code>app/api/solana/tokens/route.ts</code></td></tr>
            <tr><td>Single token wrong (e.g., POPCAT → ZN)</td><td>On-chain override won</td><td><code>lib/solana/tokenMeta.ts</code></td></tr>
            <tr><td>Logos missing</td><td><code>logoURI</code> absent</td><td><code>tokenMeta.ts</code> fallback or source</td></tr>
            <tr><td>“Loading symbols…” stuck</td><td>Enrich effect didn’t settle</td><td><code>useWalletTokens.ts</code></td></tr>
          </tbody>
        </table>

        <h2>🧪 Quick Debug</h2>
        <pre><code>{`// Count
Object.keys((await (await fetch('/api/tokenlist',{cache:'no-store'})).json()).data).length
// Single mint
const m='7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr';
(await (await fetch('/api/tokenlist',{cache:'no-store'})).json()).data[m]
// Wallet view w/ enrichment
const owner='<WALLET>';
const toks=(await (await fetch(\`/api/solana/tokens?owner=\${owner}\`,{cache:'no-store'})).json()).tokens;
const map=(await (await fetch('/api/tokenlist',{cache:'no-store'})).json()).data;
console.table(toks.map(t=>({mint:t.mint, symbol:map[t.mint]?.symbol??null, name:map[t.mint]?.name??null})));`}</code></pre>

        <p className="mt-6">
          <Link href="/docs/dev" className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100">
            ← Back to Dev Notes
          </Link>
        </p>
      </article>
    </div>
  );
}
