// app/docs/whitepaper/page.tsx
import Link from 'next/link';

export const metadata = {
  title: 'Whitepaper — Coincarnation',
  description: 'Economic design, phase distribution, governance, and risk controls.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#0b0f18] p-5">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <div className="text-sm text-white/80 space-y-2">{children}</div>
    </section>
  );
}

export default function WhitepaperPage() {
  return (
    <main className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Coincarnation — Whitepaper</h1>
          <p className="text-white/70 mt-2">
            This document outlines the protocol economics, pool-proportional distribution,
            floor policy, governance, and implementation best-practices.
          </p>
          <div className="text-xs text-white/50 mt-2">
            See also: <Link href="/trust" className="underline">Trust Pledge</Link>
          </div>
        </header>

        <Section title="1. Overview">
          <p>
            Coincarnation converts stranded assets (“deadcoins”) into MEGY via a pool-proportional
            model that is independent from external market price. Participants contribute USD value;
            MEGY is distributed by share-of-contribution.
          </p>
        </Section>

        <Section title="2. Distribution Mechanics (Pool-Proportional)">
          <ul className="list-disc pl-5">
            <li>Phase pool: <code>Pₖ</code> MEGY. Total USD: <code>USDₖ</code>.</li>
            <li>User allocation: <code>allocᵢ = pool_effective × (user_usdᵢ / USDₖ)</code>.</li>
            <li>Implied rate (USD/MEGY): <code>USDₖ / Pₖ</code>.</li>
          </ul>
          <p className="text-white/60 text-xs mt-2">
            Note: in rate-mode experiments, you can expose a reference rate (USD per 1 MEGY), but pool-mode governs actual distribution.
          </p>
        </Section>

        <Section title="3. Floor Guard & Phase Policy">
          <ul className="list-disc pl-5">
            <li>Monotonic floor: <code>r_floorₖ ≥ max(r_realizedₖ₋₁, r_targetₖ)</code>.</li>
            <li>Partial-open on shortfall: <code>pool_effective = USDₖ / r_floorₖ</code>, remainder rolls over.</li>
            <li>Auto-open next phase when demand exceeds current pool targets.</li>
          </ul>
        </Section>

        <Section title="4. Governance & Admin Controls">
          <ul className="list-disc pl-5">
            <li>Multisig for treasury and admin actions.</li>
            <li>Emergency kill-switch (<code>app_enabled</code>) and claim window (<code>claim_open</code>).</li>
            <li>Audit logs, parameter change traceability; if feasible, on-chain reference hash.</li>
          </ul>
        </Section>

        <Section title="5. Risk Controls & Transparency">
          <ul className="list-disc pl-5">
            <li>USD valuation via TWAP/VWAP across multiple sources.</li>
            <li>Live dashboards: implied rate, full-unlock target, remaining pool, participants.</li>
            <li>(Optional) Vesting, per-wallet caps, anti-sybil heuristics.</li>
          </ul>
        </Section>

        <Section title="6. Roadmap">
          <ul className="list-disc pl-5">
            <li>Phase-1 launch, snapshot & finalize tooling.</li>
            <li>Public dashboards & audit reports.</li>
            <li>Expanded governance and open-source reference modules.</li>
          </ul>
        </Section>
      </div>
    </main>
  );
}
