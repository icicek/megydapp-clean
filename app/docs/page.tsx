// app/docs/page.tsx
import Link from 'next/link';
import TrustPledge from '@/components/TrustPledge';

export const metadata = {
  title: 'Documentation — Coincarnation',
  description: 'Start here: Trust Pledge, Whitepaper, and protocol docs.',
};

function DocCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-white/10 bg-[#0b0f18] p-5 hover:bg-white/5 transition-colors"
    >
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-white/70 mt-1">{desc}</div>
      <div className="text-xs text-white/50 mt-3">Read →</div>
    </Link>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        {/* Hero */}
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Documentation</h1>
          <p className="text-white/70 max-w-3xl">
            Everything you need to understand Coincarnation: the fairness model,
            phase mechanics, governance, and implementation details.
          </p>
        </header>

        {/* Trust Pledge on top (full) */}
        <TrustPledge compact={false} />

        {/* Quick links */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Start here</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DocCard
              href="/trust"
              title="Trust Pledge (Full)"
              desc="Our fairness, floor guard, transparency and safety principles in depth."
            />
            <DocCard
              href="/docs/whitepaper"
              title="Whitepaper"
              desc="Economics, distribution mechanics, phase policy, governance, and roadmap."
            />
          </div>
        </section>
      </div>
    </main>
  );
}
