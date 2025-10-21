// app/docs/config.ts
import React from "react";

export type DocSection = {
    slug: string;
    title: string;
    summary?: string;
    // Keep content as JSX to avoid MDX complexity for now.
    Content: () => React.ReactElement;
  };
  
  export const DOC_SECTIONS: DocSection[] = [
    {
      slug: "abstract",
      title: "Abstract",
      summary:
        "Protocol intent: revive stranded value into MEGY via pool-proportional phases, with auditable, transparent rules.",
      Content: () => (
        <>
          <p>
            Coincarnation is a chain-agnostic contribution-and-distribution protocol
            that revives stranded crypto value (“deadcoins” & “walking-deadcoins”)
            by swapping participants’ assets into a common unit, <strong>$MEGY</strong>,
            governed by a <em>pool-proportional</em> model. Each phase opens a fixed
            amount of MEGY and distributes it pro-rata by contributed USD value.
          </p>
        </>
      ),
    },
    {
      slug: "problem-and-motivation",
      title: "Problem & Motivation",
      summary:
        "Billions in illiquid tokens; need transparent conversion into a common, future-oriented unit.",
      Content: () => (
        <>
          <ul className="list-disc pl-5 space-y-1">
            <li>Billions of dollars are trapped in illiquid or abandoned tokens.</li>
            <li>Pricing opacity, rug risks, coordination failures plague recovery.</li>
            <li>
              Goal: predictable, auditable conversion into <strong>$MEGY</strong> and the
              Fair Future Fund via phase-based distribution.
            </li>
          </ul>
        </>
      ),
    },
    {
      slug: "system-overview",
      title: "System Overview",
      summary:
        "Inputs → valuation → pool phase → pro-rata allocation → snapshot/claim.",
      Content: () => (
        <>
          <p>
            Users contribute assets (SOL/SPL now; EVM chains later). Contributions are
            normalized to USD using a priority source stack. For a phase with pool{" "}
            <code>Pₖ</code> and total USD <code>USDₖ</code>, user allocation is
            <code> allocᵢ = P_effective × (USDᵢ / USDₖ)</code>. Settlement is at snapshot/claim.
          </p>
        </>
      ),
    },
    {
      slug: "distribution-mechanics",
      title: "Distribution Mechanics (Pool-Proportional)",
      summary:
        "Phase variables, floor policy, effective pool, caps/vesting.",
      Content: () => (
        <>
          <h3 className="font-semibold mb-2">Phase Variables</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Pool size: <code>Pₖ</code> MEGY.</li>
            <li>Recorded demand: <code>USDₖ</code>.</li>
            <li>Optional reference rate for UI: <code>r_targetₖ</code>.</li>
          </ul>
          <h3 className="font-semibold mt-4 mb-2">Floor & Partial-Open</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Monotone floor: <code>r_floorₖ ≥ max(r_realized₍ₖ₋₁₎, r_targetₖ)</code>
            </li>
            <li>
              Effective pool: <code>P_effective = min(Pₖ, USDₖ / r_floorₖ)</code>
            </li>
            <li>Remainder rolls over to the next phase.</li>
          </ul>
        </>
      ),
    },
    {
      slug: "valuation",
      title: "Valuation & Price Integrity",
      summary:
        "Priority stack: CoinGecko → Raydium → Jupiter → CMC; safeguards and caches.",
      Content: () => (
        <>
          <p className="mb-2">Priority source stack (short-circuit on first success):</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>CoinGecko (proxied)</li>
            <li>Raydium (SPL)</li>
            <li>Jupiter</li>
            <li>CoinMarketCap</li>
            <li>Fallback: classify as deadcoin (manual registry)</li>
          </ol>
          <p className="mt-3">
            TWAP/VWAP where available, staleness thresholds, min-liquidity filters, and signed cache
            for mobile reliability. Redlist/Blacklist enforced at intake.
          </p>
        </>
      ),
    },
    {
      slug: "governance-and-admin",
      title: "Governance & Admin Controls",
      summary:
        "Multisig, feature flags, audit logs, emergency procedures.",
      Content: () => (
        <>
          <ul className="list-disc pl-5 space-y-1">
            <li>Multisig treasury/admin; hardware-wallet auth for panel.</li>
            <li>Feature flags: <code>app_enabled</code>, <code>claim_open</code>, <code>distribution_pool</code>, <code>coin_rate</code>, <code>cron_enabled</code>.</li>
            <li>Admin audit logs and optional on-chain reference hashes.</li>
            <li>Global kill-switch; per-token pause via registry.</li>
          </ul>
        </>
      ),
    },
    {
      slug: "registry-and-policy",
      title: "Token Registry & Policy",
      summary:
        "healthy / walking_dead / deadcoin / redlist / blacklist; refunds (blacklist only).",
      Content: () => (
        <>
          <p>
            Statuses define intake rules and review/rollback mechanics, including optional refunds
            (blacklist-only) to originating wallet via guided flow.
          </p>
        </>
      ),
    },
    {
      slug: "snapshot-claim-fees",
      title: "Snapshot, Claim & Fees",
      summary:
        "Dual trigger, $0.5 SOL fee example, partial claims, claim records.",
      Content: () => (
        <>
          <ul className="list-disc pl-5 space-y-1">
            <li>Dual trigger: pool threshold + min window (or governance override).</li>
            <li>Users may pay a small network fee (e.g., $0.5 in SOL) to claim.</li>
            <li>Partial claim optional; each claim is recorded with txid and fee receipt.</li>
          </ul>
        </>
      ),
    },
    {
      slug: "corepoint-pvc",
      title: "CorePoint & PVC",
      summary:
        "Real-time score (contributions, referrals, shares, deadcoin multipliers) → leaderboards, PVC.",
      Content: () => (
        <>
          <p>
            CorePoint aggregates contributions (USD-weighted), referrals, first-time share-on-X events,
            and deadcoin multipliers. It powers leaderboards and future PVC minting.
          </p>
        </>
      ),
    },
    {
      slug: "security-compliance",
      title: "Security, Risk & Compliance",
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
      summary:
        "Informational document; parameters may evolve through governance.",
      Content: () => (
        <>
          <p>
            This document is for informational purposes and not investment advice. MEGY distribution
            follows protocol rules; parameters can evolve through transparent governance.
          </p>
        </>
      ),
    },
  ];
  