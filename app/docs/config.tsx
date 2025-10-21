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
          <em>pro-rata</em> by contributed USD value. The design emphasizes fairness,
          auditability, and resilience via multi-source valuation, transparent floor
          policy, public dashboards, and explicit governance controls.
        </p>
        <p>
          Practically, participants contribute supported assets; the protocol normalizes
          them to USD using a priority pricing stack with safeguards. At snapshot, MEGY
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
          a small network fee, e.g. $0.5 in SOL). Admin/multisig governs feature flags
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
            Effective pool:{" "}
            <code>P_effective = min(Pₖ, USDₖ / r_floorₖ)</code>
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

  // --- Leave other sections as placeholders; we'll enrich over time ---
  {
    slug: "governance-and-admin",
    title: "Governance & Admin Controls",
    updatedAt: "2025-10-15",
    words: 140,
    summary: "Multisig, feature flags, audit logs, emergency procedures.",
    Content: () => (
      <>
        <ul className="list-disc pl-5 space-y-1">
          <li>Multisig treasury/admin; hardware-wallet auth for panel.</li>
          <li>
            Feature flags: <code>app_enabled</code>, <code>claim_open</code>,{" "}
            <code>distribution_pool</code>, <code>coin_rate</code>, <code>cron_enabled</code>.
          </li>
          <li>Admin audit logs and optional on-chain reference hashes.</li>
          <li>Global kill-switch; per-token pause via registry.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "registry-and-policy",
    title: "Token Registry & Policy",
    updatedAt: "2025-10-15",
    words: 110,
    summary:
      "healthy / walking_dead / deadcoin / redlist / blacklist; refunds (blacklist only).",
    Content: () => (
      <>
        <p>
          Statuses define intake rules and review/rollback mechanics, including optional refunds
          (blacklist-only) to the originating wallet via a guided flow.
        </p>
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
          <li>Partial claim optional; each claim recorded with txid & fee receipt.</li>
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
    updatedAt: "2025-10-09",
    words: 140,
    summary:
      "Origin/CSRF guards, JWT admin, idempotency, rate limits, disclaimers.",
    Content: () => (
      <>
        <ul className="list-disc pl-5 space-y-1">
          <li>Strict origin checks, CSRF guards, and JWT-backed admin sessions.</li>
          <li>Idempotency for writes; replay protection; rate limits.</li>
          <li>Clear disclaimers; non-custodial posture where possible.</li>
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
