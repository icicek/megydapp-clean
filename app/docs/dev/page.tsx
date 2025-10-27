// app/docs/dev/page.tsx
export default function DevDocsHub() {
    return (
      <div className="min-h-[60vh] px-4 py-6 text-white">
        <h1 className="text-2xl font-bold mb-4">Developer Notes</h1>
        <p className="text-sm text-gray-300 mb-6">
          Internal engineering docs for Coincarnation DApp.
        </p>
  
        <ul className="space-y-2">
          <li>
            <a
              href="/docs/tokenlist-architecture"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
            >
              🧠 Tokenlist Intelligence System
            </a>
          </li>
          <li>
            <a
              href="/docs/cron-architecture"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
            >
              ⏱️ Cron / Reclassifier Architecture
            </a>
          </li>
          <li>
            <a
              href="/docs/claim-flow"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
            >
              🧾 Claim Flow
            </a>
          </li>
          <li>
            <a
              href="/docs/corepoint-system"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
            >
              🏆 CorePoint System
            </a>
          </li>
        </ul>
      </div>
    );
  }
  