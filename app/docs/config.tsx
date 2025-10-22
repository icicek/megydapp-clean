// app/docs/config.tsx
import React from "react";

export type DocSection = {
  slug: string;
  title: string;
  summary?: string;
  updatedAt?: string;   // ISO (YYYY-MM-DD)
  words?: number;       // approx word count for read-time (~200 wpm)
  Content: () => React.ReactElement;
};

export const DOC_SECTIONS: DocSection[] = [
  {
    slug: "abstract",
    title: "Abstract",
    updatedAt: "2025-10-21",
    words: 170,
    summary:
      "Protocol intent: revive stranded value into MEGY via pool-proportional phases with verifiable accounting.",
    Content: () => (
      <>
        <p>
          Coincarnation is a chain-agnostic contribution & distribution protocol that
          revives stranded crypto value (“deadcoins” & “walking-deadcoins”) into a
          common unit, <strong>$MEGY</strong>. Instead of relying on a volatile market
          price, each phase opens a fixed supply pool and allocates MEGY
          <em> pro-rata</em> by contributed USD value. The design emphasizes fairness,
          auditability, and resilience via multi-source valuation, a transparent floor
          policy, public dashboards, and explicit governance controls.
        </p>
        <p>
          Practically, participants contribute supported assets; the protocol normalizes
          them to USD using a prioritized pricing stack with safeguards. At snapshot, MEGY
          is distributed according to each wallet’s share of phase demand. Optional
          vesting, caps, and anti-sybil controls can be enabled to smooth supply and
          protect the system.
        </p>
      </>
    ),
  },
  {
    slug: "system-overview",
    title: "System Overview",
    updatedAt: "2025-10-21",
    words: 220,
    summary:
      "Inputs → valuation → pool phase → pro-rata allocation → snapshot/claim.",
    Content: () => (
      <>
        <p>
          Users contribute assets on Solana (SOL & SPL) in Phase-1 and on major EVM
          chains in Phase-2. Each contribution is normalized to USD through a priority
          source stack. For a phase with pool <code>Pₖ</code> MEGY and total demand{" "}
          <code>USDₖ</code>, a user with contribution <code>USDᵢ</code> obtains:
        </p>
        <p>
          <code>allocᵢ = P_effective × (USDᵢ / USDₖ)</code>
        </p>
        <p>
          The <code>P_effective</code> depends on the phase floor policy. Settlement
          occurs at snapshot, after which users can claim their MEGY (optionally paying
          a small network fee, e.g., $0.5 in SOL). Admin/multisig governs feature flags
          (<code>app_enabled</code>, <code>claim_open</code>) and phase parameters,
          with audit logs and optional on-chain reference hashes to ensure traceability.
        </p>
      </>
    ),
  },
  {
    slug: "distribution-mechanics",
    title: "Distribution Mechanics (Pool-Proportional)",
    updatedAt: "2025-10-21",
    words: 320,
    summary: "Phase variables, floor policy, effective pool, caps/vesting.",
    Content: () => (
      <>
        <h3 className="font-semibold mb-2">3.1 Phase Variables</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Pool size: <code>Pₖ</code> MEGY opened in phase <code>k</code>.</li>
          <li>Recorded demand: <code>USDₖ</code> total USD during the phase.</li>
          <li>Optional reference rate (UI only): <code>r_targetₖ</code> USD/MEGY.</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">3.2 Floor & Partial-Open Policy</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Monotone floor: <code>r_floorₖ ≥ max(r_realized₍ₖ₋₁₎, r_targetₖ)</code>
          </li>
          <li>
            Effective pool: <code>P_effective = min(Pₖ, USDₖ / r_floorₖ)</code>
          </li>
          <li>
            Remainder <code>(Pₖ − P_effective)</code> rolls into the next phase if
            demand is below the floor.
          </li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">3.3 User Allocation</h3>
        <p>
          <code>allocᵢ = P_effective × (USDᵢ / USDₖ)</code>{" "}
          (subject to per-wallet caps and vesting, if enabled).
        </p>

        <h3 className="font-semibold mt-4 mb-2">3.4 Optional Caps & Vesting</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Per-wallet cap to reduce concentration and sybil risks.</li>
          <li>Linear vesting or cliffs to smooth post-phase token release.</li>
        </ul>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <div className="font-semibold mb-1">Example</div>
          <p>
            If <code>Pₖ = 5B MEGY</code>, <code>USDₖ = 250,000</code>,
            and <code>r_floor = 0.00005 USD/MEGY</code>, then{" "}
            <code>P_effective = USDₖ / r_floor = 5B</code> (full open).
            A user with <code>USDᵢ = 1,000</code> receives{" "}
            <code>5,000,000,000 × (1,000 / 250,000) = 20,000,000</code> MEGY
            before vesting/caps.
          </p>
        </div>
      </>
    ),
  },
  {
    slug: "valuation",
    title: "Valuation & Price Integrity",
    updatedAt: "2025-10-21",
    words: 300,
    summary:
      "Priority stack: CoinGecko → Raydium → Jupiter → CMC; safeguards, staleness, caching.",
    Content: () => (
      <>
        <p className="mb-2">
          The protocol normalizes contributions to USD using a priority source stack.
          It short-circuits on the first successful source and applies safeguards:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>CoinGecko (proxied; mobile-friendly)</li>
          <li>Raydium (SPL pools)</li>
          <li>Jupiter Aggregator</li>
          <li>CoinMarketCap</li>
          <li>Fallback: classify as deadcoin (manual registry path)</li>
        </ol>
        <p className="mt-3">
          Where available, TWAP/VWAP is preferred; the system enforces staleness
          thresholds and minimum liquidity screens. Results are cached with signed
          provenance to avoid device/network inconsistencies. Redlist/Blacklist rules
          are enforced at intake time so disallowed tokens cannot enter distribution.
        </p>
      </>
    ),
  },

  // --- The remaining sections (expanded in English) ---
  {
    slug: "governance-and-admin",
    title: "Governance & Admin Controls",
    updatedAt: "2025-10-21",
    words: 420,
    summary:
      "Multisig, feature flags, audit logs, emergency procedures, and operational discipline.",
    Content: () => (
      <>
        <h3 className="font-semibold mb-2">6.1 Roles & AuthN/AuthZ</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Treasury Multisig:</strong> custody and sensitive parameter changes.</li>
          <li>
            <strong>Admin Panel:</strong> hardware-wallet <code>signMessage</code> → nonce → verify →{" "}
            <code>coincarnation_admin</code> cookie (HttpOnly, SameSite).
          </li>
          <li>
            <strong>Role separation:</strong> Ops (runtime toggles), Risk (registry/policy),
            Finance (treasury), Audit (read-only export).
          </li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">6.2 Feature Flags</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>app_enabled</code>: global kill-switch.</li>
          <li><code>claim_open</code>: claim window control after snapshot.</li>
          <li>
            <code>distribution_pool</code>, <code>coin_rate</code>: phase pool and reference rate
            parameters.
          </li>
          <li><code>cron_enabled</code>: reclassifier cron guard.</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">6.3 Change Management</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Cooldowns:</strong> change interval for critical parameters—“announce → grace → apply”.</li>
          <li><strong>On-chain ref-hash (optional):</strong> parameter set hashes written on-chain to enable public verification.</li>
          <li><strong>CSV & public dashboards:</strong> external-audit-friendly visibility.</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">6.4 Emergency Procedures</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Global pause (<code>app_enabled=false</code>), per-token intake stop via registry.</li>
          <li>Blacklist detection → optional refund flow for past contributions.</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">6.5 Auditability</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>admin_audit</code> table: who changed what and when.</li>
          <li>Each cron run → <code>cron_runs</code>; diffs written to <code>token_audit</code>.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "registry-and-policy",
    title: "Token Registry & Policy",
    updatedAt: "2025-10-21",
    words: 460,
    summary:
      "Status matrix, intake rules, redlist/blacklist semantics, reclassification & refunds.",
    Content: () => (
      <>
        <h3 className="font-semibold mb-2">7.1 Status Matrix</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>healthy</code>: normal intake.</li>
          <li><code>walking_dead</code>: intake allowed, under observation.</li>
          <li><code>deadcoin</code>: revival-focused; special visuals/labeling.</li>
          <li>
            <code>redlist</code>: new intake <strong>blocked</strong> after add-date; past
            contributions remain valid.
          </li>
          <li>
            <code>blacklist</code>: fully disallowed; past contributions <strong>invalid</strong>;
            optional refunds.
          </li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">7.2 Intake Rules & Guards</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Pre-check: network match, mint/address format, min-liquidity/pricing threshold.</li>
          <li>Intake doesn’t finalize until valuation pipeline yields a valid price.</li>
          <li>Per-token cap and per-wallet cap are optional.</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">7.3 Redlist vs Blacklist</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Redlist:</strong> forward-looking ban; historical contributions kept.</li>
          <li><strong>Blacklist:</strong> retroactively <em>invalid</em>; optional refund to originating wallet.</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">7.4 Reclassification</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Cron job escalates <code>walking_dead → deadcoin</code> based on age, price inactivity,
            and case/vote triggers.
          </li>
          <li>All status changes are written to <code>token_audit</code>.</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">7.5 Refunds (Blacklist-only)</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Refunds are optional and only for <code>blacklist</code> items.</li>
          <li>Each refund is deduplicated and directed to the original sender wallet.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "snapshot-claim-fees",
    title: "Snapshot, Claim & Fees",
    updatedAt: "2025-10-12",
    words: 120,
    summary:
      "Dual trigger, small claim fee, partial claims, on-chain records.",
    Content: () => (
      <>
        <ul className="list-disc pl-5 space-y-1">
          <li>Dual trigger: pool threshold + minimum time (or governance override).</li>
          <li>Small network fee (e.g., $0.5 in SOL) to claim.</li>
          <li>Partial claim optional; each claim recorded with txid and fee receipt.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "corepoint-pvc",
    title: "CorePoint & PVC",
    updatedAt: "2025-10-10",
    words: 130,
    summary:
      "Real-time score (contrib, referrals, shares, deadcoin multipliers) → leaderboards, PVC.",
    Content: () => (
      <>
        <p>
          CorePoint aggregates contribution (USD-weighted), referrals, first-time share-on-X events,
          and deadcoin multipliers. It powers leaderboards and future PVC minting.
        </p>
      </>
    ),
  },
  {
    slug: "security-compliance",
    title: "Security, Risk & Compliance",
    updatedAt: "2025-10-21",
    words: 500,
    summary:
      "Origin/CSRF, JWT cookies, idempotency & replay guards, data hygiene, legal posture.",
    Content: () => (
      <>
        <h3 className="font-semibold mb-2">11.1 Application Security</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Admin cookie: HttpOnly, SameSite, short-lived; origin and CSRF checks.</li>
          <li>Idempotency keys & replay protection on all write operations.</li>
          <li>Rate limits; wallet allowlist for admin areas.</li>
          <li>Signed caching & server-side price proxy (mobile-friendly & CORS-safe).</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">11.2 Data Hygiene</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>PII minimization; user-agent/IP kept only to the operational extent necessary.</li>
          <li>Log rotation & retention windows; store only when required.</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">11.3 Legal Posture</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Clear “no investment advice” statement; protocol rules govern outcomes.</li>
          <li>Non-custodial posture wherever technically feasible.</li>
          <li>
            Jurisdiction awareness; we do not perform sanctions screening ourselves, but
            partner-compatible integrations can be considered where appropriate.
          </li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">11.4 Transparency</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Public dashboards; <code>export.csv</code>; audit-friendly traces.</li>
          <li>“Announce → grace → apply” for parameter changes and (optional) on-chain ref-hashes.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "roadmap",
    title: "Roadmap",
    updatedAt: "2025-10-08",
    words: 90,
    summary:
      "Phase-1 Solana, Phase-2 EVM, Phase-3 governance & audits.",
    Content: () => (
      <>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Phase-1: Solana live; snapshot/claim tooling; dashboards & CSV.</li>
          <li>Phase-2: EVM integrations; cross-chain valuation harmonization.</li>
          <li>Phase-3: Governance expansion, PVC minting, audits, OSS modules.</li>
        </ol>
      </>
    ),
  },
  {
    slug: "disclaimers",
    title: "Disclaimers",
    updatedAt: "2025-10-07",
    words: 70,
    summary:
      "Informational document; parameters may evolve through governance.",
    Content: () => (
      <>
        <p>
          This document is for informational purposes and not investment advice.
          Distribution follows protocol rules; parameters can evolve via transparent governance.
        </p>
      </>
    ),
  },
];
