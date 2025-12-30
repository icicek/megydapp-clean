// app/docs/whitepaper/page.tsx
import Link from 'next/link';

export const metadata = {
  title: 'Whitepaper — Coincarnation',
  description: 'Economic design, pool-proportional distribution, governance, and risk controls.',
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

        {/* ------------------------------------------------ */}
        {/* 1–6: existing sections                          */}
        {/* ------------------------------------------------ */}

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

        {/* ------------------------------------------------ */}
        {/* 7+: NEW: Token classification & rewards spec     */}
        {/* ------------------------------------------------ */}

        <Section title="7. Token Status Registry & Overrides">
          <p>
            Coincarnation maintains a token registry that classifies every asset into one of the
            following statuses:
          </p>
          <ul className="list-disc pl-5">
            <li><code>healthy</code> – sufficiently liquid and actively traded.</li>
            <li><code>walking_dead</code> – structurally weak, low-liquidity or low-activity assets.</li>
            <li><code>deadcoin</code> – economically dead or functionally abandoned assets.</li>
            <li><code>redlist</code> – disallowed for new Coincarnations; historic contributions remain valid.</li>
            <li><code>blacklist</code> – disallowed and subject to revocation or refund policy.</li>
          </ul>
          <p>
            Each registry entry can optionally carry a <strong>lock flag</strong>:
          </p>
          <ul className="list-disc pl-5">
            <li><code>lock = null</code> – status may be updated automatically by reclassification.</li>
            <li><code>lock = &quot;admin&quot;</code> – status is frozen with an admin decision (cron does not override).</li>
            <li><code>lock = &quot;community&quot;</code> – status is frozen by community vote (final Deadcoin decision).</li>
          </ul>
          <p className="text-xs text-white/60">
            Automatic reclassification and cron jobs <strong>always respect</strong> these locks.
            Blacklist and Redlist have the highest precedence in the system.
          </p>
        </Section>

        <Section title="8. Valuation & Classification Layers">
          <p className="font-semibold">
            8.1 Price layer – Is the asset economically alive?
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-white/10 border-collapse">
              <thead>
                <tr className="bg-white/5">
                  <th className="border border-white/10 px-2 py-1 text-left">Condition</th>
                  <th className="border border-white/10 px-2 py-1 text-left">Result</th>
                  <th className="border border-white/10 px-2 py-1 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-white/10 px-2 py-1">
                    Price fetch <code>status = error</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1">
                    <code>category = &quot;unknown&quot;</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1">
                    Technical failure, transaction should be retried or rejected.
                  </td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">
                    Price <code>status = not_found</code> or <code>UsdValue ≤ 0</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1">
                    <code>category = &quot;deadcoin&quot;</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1">
                    No meaningful price across sources – treated as economically dead.
                  </td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">
                    Price <code>status = ok</code> and <code>UsdValue &gt; 0</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1">
                    Forwarded to liquidity &amp; volume layer
                  </td>
                  <td className="border border-white/10 px-2 py-1">
                    Asset has some positive value; risk level is determined by metrics.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-white/60">
            If a rare anomaly occurs where <code>liquidity &gt; 0</code> but <code>UsdValue = 0</code>,
            the protocol treats the asset as a Deadcoin for safety and records an audit reason
            such as <code>anomaly_liq&gt;0_usd=0</code> for manual review.
          </p>

          <p className="font-semibold mt-4">
            8.2 Liquidity &amp; volume layer – How fragile is the market?
          </p>
          <p>
            Liquidity-first thresholds are configured via governance:
            <code>healthyMinLiq</code>, <code>healthyMinVol</code>, <code>walkingDeadMinLiq</code>,{' '}
            <code>walkingDeadMinVol</code>.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-white/10 border-collapse mt-2">
              <thead>
                <tr className="bg-white/5">
                  <th className="border border-white/10 px-2 py-1 text-left">Region</th>
                  <th className="border border-white/10 px-2 py-1 text-left">Condition</th>
                  <th className="border border-white/10 px-2 py-1 text-left">Category</th>
                  <th className="border border-white/10 px-2 py-1 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-white/10 px-2 py-1">No DEX signal</td>
                  <td className="border border-white/10 px-2 py-1">
                    dex source <code>none</code>, <code>liq = 0</code>, <code>dexVol = 0</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1"><code>deadcoin</code></td>
                  <td className="border border-white/10 px-2 py-1"><code>no_data</code></td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">High-liquidity</td>
                  <td className="border border-white/10 px-2 py-1">
                    <code>liq ≥ healthyMinLiq</code>, <code>vol ≥ healthyMinVol</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1"><code>healthy</code></td>
                  <td className="border border-white/10 px-2 py-1"><code>healthy</code></td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">High-liq / low-vol</td>
                  <td className="border border-white/10 px-2 py-1">
                    <code>liq ≥ healthyMinLiq</code> but <code>vol &lt; healthyMinVol</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1"><code>walking_dead</code></td>
                  <td className="border border-white/10 px-2 py-1">
                    <code>low_activity</code> or <code>subhealthy</code>
                  </td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">Mid-liquidity</td>
                  <td className="border border-white/10 px-2 py-1">
                    <code>healthyMinLiq &gt; liq ≥ walkingDeadMinLiq</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1"><code>walking_dead</code></td>
                  <td className="border border-white/10 px-2 py-1">
                    structurally weak liquidity, regardless of volume
                  </td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">Near-zero liquidity</td>
                  <td className="border border-white/10 px-2 py-1">
                    <code>walkingDeadMinLiq &gt; liq &gt; 0</code>
                  </td>
                  <td className="border border-white/10 px-2 py-1"><code>walking_dead</code></td>
                  <td className="border border-white/10 px-2 py-1">
                    <code>illiquid</code>; eligible for community Deadcoin review.
                  </td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">Zero liquidity</td>
                  <td className="border border-white/10 px-2 py-1"><code>liq = 0</code></td>
                  <td className="border border-white/10 px-2 py-1"><code>deadcoin</code></td>
                  <td className="border border-white/10 px-2 py-1">
                    fully stranded; only Deadcoin Bonus can remain.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="9. Rewards: MEGY, CorePoints, Deadcoin Bonus">
          <p>
            Coincarnation uses three distinct reward layers for each contribution:
          </p>
          <ul className="list-disc pl-5">
            <li><strong>MEGY</strong> – claimable pool token, distributed pool-proportionally.</li>
            <li>
              <strong>CorePoints (CP)</strong> – personal value currency inside the Levershare ecosystem,
              earned from USD contributions, referrals, and social actions.
            </li>
            <li>
              <strong>Deadcoin Bonus</strong> – additional recognition for rescuing assets that are
              effectively dead (zero or near-zero economic value).
            </li>
          </ul>
          <p className="mt-2">
            MEGY and CP are strictly conditioned on the economic value detected at the time of Coincarnation.
          </p>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs border border-white/10 border-collapse">
              <thead>
                <tr className="bg-white/5">
                  <th className="border border-white/10 px-2 py-1 text-left">Final Category</th>
                  <th className="border border-white/10 px-2 py-1 text-left">UsdValue &gt; 0?</th>
                  <th className="border border-white/10 px-2 py-1 text-left">MEGY</th>
                  <th className="border border-white/10 px-2 py-1 text-left">CorePoints</th>
                  <th className="border border-white/10 px-2 py-1 text-left">Deadcoin Bonus</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-white/10 px-2 py-1"><code>healthy</code></td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1"><code>walking_dead</code></td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">
                    <code>deadcoin</code> (community or admin lock)
                  </td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1">
                    <code>deadcoin</code> (any lock)
                  </td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">yes</td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1"><code>redlist</code></td>
                  <td className="border border-white/10 px-2 py-1">n/a</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1"><code>blacklist</code></td>
                  <td className="border border-white/10 px-2 py-1">n/a</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                </tr>
                <tr>
                  <td className="border border-white/10 px-2 py-1"><code>unknown</code></td>
                  <td className="border border-white/10 px-2 py-1">n/a</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                  <td className="border border-white/10 px-2 py-1">no</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-white/60 mt-2">
            Historic rewards (MEGY, CP, Deadcoin Bonus) earned under earlier classifications
            remain valid even if a token is reclassified later, except for explicit blacklist
            or fraud cases governed by a separate policy.
          </p>
        </Section>

        <Section title="10. Community Deadcoin Voting">
          <p>
            For borderline cases, Coincarnation delegates the final &quot;Deadcoin or not&quot; decision
            to the community. Assets in the Walking Dead region with critically low liquidity may be
            flagged as <em>vote-eligible</em>.
          </p>
          <ul className="list-disc pl-5">
            <li>
              Voting is only enabled for tokens in <code>walking_dead</code> status (not blacklisted or redlisted).
            </li>
            <li>
              When a predefined threshold of YES votes is reached, the token is promoted to{' '}
              <code>deadcoin</code> with <code>lock = &quot;community&quot;</code>.
            </li>
            <li>
              Once community-locked, cron jobs and later price changes do not revert the Deadcoin status.
            </li>
            <li>
              Future Coincarnations for that token follow the Deadcoin reward matrix (no MEGY, CP + Bonus only when value &gt; 0).
            </li>
          </ul>
          <p className="text-xs text-white/60">
            The protocol can later introduce CorePoint rewards for voters without changing the
            classification logic described here.
          </p>
        </Section>

        <Section title="11. Reclassification, Cron Jobs & Snapshots">
          <p className="font-semibold">
            11.1 Per-transaction reclassification
          </p>
          <p>
            Every Coincarnation request triggers a lightweight reclassification for the specific token:
          </p>
          <ul className="list-disc pl-5">
            <li>Fetch latest price, liquidity, and volume metrics.</li>
            <li>Apply the classification logic (price + metrics + registry overrides).</li>
            <li>
              If a status change is warranted and not blocked by a lock, update the registry and write
              an audit entry with <code>old_status</code>, <code>new_status</code>, and a structured reason.
            </li>
          </ul>

          <p className="font-semibold mt-3">
            11.2 Periodic cron reclassification
          </p>
          <p>
            A separate cron process runs on a schedule (e.g. every 15 minutes) to reclassify tokens in bulk:
          </p>
          <ul className="list-disc pl-5">
            <li>Only tokens without <code>admin</code> or <code>community</code> locks are eligible.</li>
            <li>
              The same classification engine is used, ensuring consistent decisions between Coincarnation
              actions and background maintenance.
            </li>
            <li>
              All changes are recorded in audit tables, allowing full reconstruction of classification history.
            </li>
          </ul>

          <p className="font-semibold mt-3">
            11.3 Snapshots & configuration versions
          </p>
          <p>
            Participant rights (MEGY, CorePoints, Deadcoin Bonuses) are fixed at snapshot time and are not
            retroactively changed by later reclassifications, except in explicit blacklist or fraud cases.
          </p>
          <p className="text-xs text-white/60">
            The protocol may version its configuration (e.g. threshold sets) so that each snapshot and audit
            record can be associated with the exact rule-set that was active when the decision was made.
          </p>
        </Section>
      </div>
    </main>
  );
}
