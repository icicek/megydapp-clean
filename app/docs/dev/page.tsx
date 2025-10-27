// app/docs/dev/page.tsx
import Link from 'next/link';

export default function DevDocsHub() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-4">Developer Notes</h1>
      <p className="text-sm text-gray-300 mb-6">
        Internal engineering docs for Coincarnation DApp.
      </p>

      <div className="flex flex-col gap-3">
        <Link href="/docs/dev/tokenlist-intelligence-system" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm">
          🧠 <span>Tokenlist Intelligence System</span>
        </Link>
        <Link href="/docs/dev/cron-reclassifier" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm">
          ⏱️ <span>Cron / Reclassifier Architecture</span>
        </Link>
        <Link href="/docs/dev/claim-flow" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm">
          📄 <span>Claim Flow</span>
        </Link>
        <Link href="/docs/dev/corepoint-system" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm">
          🏆 <span>CorePoint System</span>
        </Link>

        {/* Whitepaper linki opsiyonel kalsın */}
        <Link href="/docs" className="mt-4 text-xs text-gray-400 underline underline-offset-4">Open Whitepaper</Link>
      </div>
    </>
  );
}
