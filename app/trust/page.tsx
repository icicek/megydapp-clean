// app/trust/page.tsx
import Link from 'next/link';

export const metadata = {
  title: 'Trust Pledge — Coincarnation',
  description: 'Fair distribution, floor guard, transparency, and security principles.',
};

export default function TrustPage() {
  return (
    <main className="mx-auto max-w-4xl p-6 text-white">
      <h1 className="text-2xl md:text-3xl font-bold mb-4">Trust Pledge</h1>
      <p className="text-zinc-300 mb-8">
        Coincarnation keeps distribution market-independent and manipulation-resistant using
        <span className="font-semibold"> Pool-Proportional</span> distribution and a
        <span className="font-semibold"> Floor Guard</span>. The following items define our fairness and trust framework.
      </p>

      <Section
        title="1) Fair Distribution (Pool-Proportional)"
        body={[
          'For phase k, the pool Pₖ (MEGY) is distributed over total contributions USDₖ.',
          'User allocation: allocationᵢ = pool_effective × (user_usdᵢ / USDₖ).',
        ]}
      />
      <Section
        title="2) Floor Guard"
        body={[
          'Phase k has a minimum USD/MEGY target r_floorₖ.',
          'If contributions are low: pool_effective = USDₖ / r_floorₖ; the remainder rolls over to the next phase.',
          'Monotonic floor: r_floorₖ ≥ max(r_realizedₖ₋₁, r_targetₖ).',
        ]}
      />
      <Section
        title="3) Market Independence"
        body={[
          'Distribution is not tied to external market price; no “first-come fixed-rate” race.',
          'USD measurements use TWAP/VWAP and multiple sources.',
        ]}
      />
      <Section
        title="4) Live Transparency"
        body={[
          'Implied rate = USDₖ / Pₖ (USD/MEGY).',
          'Full-unlock target = Pₖ × r_floorₖ.',
          'Remaining pool, participant counts, and countdown are publicly visible.',
        ]}
      />
      <Section
        title="5) Snapshot & Finalization"
        body={[
          'When deadline + thresholds are met, the phase is finalized. Contributions are snapshotted and allocations are frozen.',
          'Rollover policy: Pₖ − pool_effective is added to Pₖ₊₁ (or burned) per governance rules.',
        ]}
      />
      <Section
        title="6) Vesting & Anti-Sybil (Optional)"
        body={[
          'Example: TGE % split + 30-day linear vesting; per-phase per-wallet caps; optional social/verification signals.',
        ]}
      />
      <Section
        title="7) Secure Governance"
        body={[
          'Multisig treasury/admin; emergency kill-switch (app_enabled); claim window control (claim_open).',
          'All parameter changes are auditable via logs and, if possible, an on-chain reference hash.',
        ]}
      />
      <Section
        title="8) Audits & Reporting"
        body={[
          'Independent security reviews; regular metric reports.',
          'Contribution records, allocations, and vesting movements are reviewable.',
        ]}
      />

      <div className="mt-10 text-sm text-zinc-400">
        For the landing-page summary, use{' '}
        <code className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700">components/TrustPledge.tsx</code>.{' '}
        <Link className="underline" href="/">
          Back to Home
        </Link>
        .
      </div>
    </main>
  );
}

function Section({ title, body }: { title: string; body: string[] }) {
  return (
    <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <ul className="list-disc pl-5 space-y-1 text-zinc-300 text-sm">
        {body.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
