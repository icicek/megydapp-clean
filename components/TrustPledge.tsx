// components/TrustPledge.tsx
import Link from 'next/link';

type Props = { compact?: boolean };

export default function TrustPledge({ compact = true }: Props) {
  return (
    <section className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 md:p-8 text-white">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-xl md:text-2xl font-semibold">Trust Pledge</h2>
        <Link
          href="/trust"
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-sm"
        >
          Learn more
        </Link>
      </div>

      <p className="text-sm text-zinc-400 mb-4">
        Coincarnation is designed for fairness and transparency. These principles are core to the protocol.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InfoCard title="Pool-Proportional Distribution" body="Each phase’s MEGY pool is distributed proportionally to users’ USD contributions." />
        <InfoCard title="Floor Guard" body="A phase’s USD/MEGY never falls below the previous phase. If contributions are low, partial distribution and rollover apply." />
        <InfoCard title="Market Independence" body="Distribution is independent from external market price; resistant to manipulation." />
        <InfoCard title="Live Transparency" body="Implied rate, full-unlock target, remaining pool, and participant counts are public." />
        <InfoCard title="Snapshot & Finalize" body="At phase close, contributions are snapshotted and allocations are frozen for distribution." />
        <InfoCard title="Vesting (Optional)" body="TGE + linear vesting can reduce immediate sell pressure." />
        <InfoCard title="Secure Governance" body="Multisig, emergency kill-switch, audit logs, and traceable parameter changes." />
        <InfoCard title="Auditable Records" body="USD values via TWAP/VWAP; regular metric reports published." />
      </div>

      {!compact && (
        <div className="mt-4 text-xs text-zinc-500">
          Details and formulas are available at <Link className="underline" href="/trust">/trust</Link>.
        </div>
      )}
    </section>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="font-medium mb-1">{title}</div>
      <div className="text-sm text-zinc-400">{body}</div>
    </div>
  );
}
