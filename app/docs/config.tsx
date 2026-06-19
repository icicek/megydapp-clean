// app/docs/config.tsx
import React from "react";

export type DocSection = {
  slug: string;
  title: string;
  summary?: string;
  updatedAt?: string;
  words?: number;
  Content: () => React.ReactElement;
};

export const DOC_SECTIONS: DocSection[] = [
  // ============================================================
  // PART I — THE PROBLEM
  // ============================================================

  {
    slug: "executive-summary",
    title: "Executive Summary",
    updatedAt: "2026-06-16",
    words: 300,
    summary:
      "A concise overview of Coincarnation, Fair Future Fund, Proof of Value, PVC, and MEGY.",
    Content: () => (
      <>
        <p>
          Coincarnation is not designed to build another token economy. It is
          designed to explore whether access to capital formation, value
          recognition, and economic opportunity can become more broadly
          distributed.
        </p>
        <p>
          Coincarnation creates capital. The Fair Future Fund manages and grows
          it. Proof of Value recognizes contribution. Personal Value Currency
          distributes opportunity.
        </p>
      </>
    ),
  },

  {
    slug: "global-inequality",
    title: "Global Inequality & Capital Formation",
    updatedAt: "2026-06-16",
    words: 420,
    summary:
      "Why access to capital formation matters for economic opportunity.",
    Content: () => (
      <>
        <p>
          Economic opportunity should not be limited by existing capital
          ownership. Coincarnation begins from the observation that many people
          create value, yet remain excluded from the systems that generate
          long-term capital growth.
        </p>
        <p>
          The project does not claim to solve global inequality. Instead, it
          explores whether broader participation in capital formation can create
          new pathways toward opportunity.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART II — PHILOSOPHY
  // ============================================================

  {
    slug: "foundational-beliefs",
    title: "Foundational Beliefs",
    updatedAt: "2026-06-16",
    words: 450,
    summary:
      "The core beliefs behind Coincarnation’s economic design.",
    Content: () => (
      <>
        <ul className="list-disc pl-5 space-y-2">
          <li>Value creation should matter.</li>
          <li>Capital formation can become more inclusive.</li>
          <li>Contribution should become economically visible.</li>
          <li>Recognition and accountability must coexist.</li>
          <li>Opportunity can generate more opportunity.</li>
        </ul>
      </>
    ),
  },

  {
    slug: "coincarnation-philosophy",
    title: "Coincarnation Philosophy",
    updatedAt: "2026-06-16",
    words: 500,
    summary:
      "The idea that value creation and economic participation can be reconnected.",
    Content: () => (
      <>
        <p>
          Coincarnation explores a simple question: can value creation and
          economic participation be brought closer together again?
        </p>
        <p>
          The project does not reject existing financial systems. It seeks to
          complement them by creating additional pathways through which
          individuals may participate in future opportunity creation.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART III — CAPITAL FORMATION
  // ============================================================

  {
    slug: "capital-formation",
    title: "Capital Formation Without Traditional Fundraising",
    updatedAt: "2026-06-16",
    words: 600,
    summary:
      "How Coincarnation transforms existing digital assets into productive capital.",
    Content: () => (
      <>
        <p>
          Most token projects begin by asking participants to commit new capital.
          Coincarnation follows a different path.
        </p>

        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse border border-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="border border-white/10 px-3 py-2 text-left">
                  Traditional Token Sale
                </th>
                <th className="border border-white/10 px-3 py-2 text-left">
                  Coincarnation
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Requires New Capital", "Utilizes Existing Capital"],
                ["Speculative Entry", "Recovery-Oriented Participation"],
                ["One-Time Purchase", "Ongoing Participation"],
                ["Investor Acquisition", "Community Formation"],
                ["Capital Collection", "Capital Transformation"],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td className="border border-white/10 px-3 py-2">{a}</td>
                  <td className="border border-white/10 px-3 py-2">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          Coincarnation does not seek to create value from promises. It seeks to
          transform existing value into future opportunity.
        </p>
      </>
    ),
  },

  {
    slug: "coincarnation-protocol",
    title: "Coincarnation Protocol",
    updatedAt: "2026-06-16",
    words: 500,
    summary:
      "The lifecycle from asset discovery to classification, contribution, recognition, and distribution.",
    Content: () => (
      <>
        <p>
          The Coincarnation Protocol begins when a participant brings an eligible
          digital asset into the ecosystem. The asset is classified, contributed,
          recorded, and recognized through the Proof of Value framework.
        </p>

        <pre className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm overflow-x-auto">
{`Asset Discovery
       ↓
Classification
       ↓
Coincarnation
       ↓
Treasury Allocation
       ↓
Proof of Value Recognition
       ↓
PVC Generation
       ↓
MEGY Distribution`}
        </pre>
      </>
    ),
  },

  // ============================================================
  // PART IV — ASSET CLASSIFICATION
  // ============================================================

  {
    slug: "asset-classification",
    title: "Asset Classification Framework",
    updatedAt: "2026-06-16",
    words: 550,
    summary:
      "Healthy assets, Walking Deadcoins, Deadcoins, and Community Deadcoins.",
    Content: () => (
      <>
        <p>
          Classification is intended to recognize economic reality rather than
          project popularity.
        </p>

        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse border border-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="border border-white/10 px-3 py-2 text-left">Classification</th>
                <th className="border border-white/10 px-3 py-2 text-left">Economic Activity</th>
                <th className="border border-white/10 px-3 py-2 text-left">Treasury Eligibility</th>
                <th className="border border-white/10 px-3 py-2 text-left">Reward</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Healthy", "High", "Eligible", "MEGY + CP"],
                ["Walking Deadcoin", "Moderate", "Conditional", "MEGY + CP"],
                ["Deadcoin", "None", "No", "CP Only"],
                ["Community Deadcoin", "Community Determined", "No", "CP Only"],
              ].map(([a, b, c, d]) => (
                <tr key={a}>
                  <td className="border border-white/10 px-3 py-2">{a}</td>
                  <td className="border border-white/10 px-3 py-2">{b}</td>
                  <td className="border border-white/10 px-3 py-2">{c}</td>
                  <td className="border border-white/10 px-3 py-2">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },

  {
    slug: "community-classification",
    title: "Community Classification & Governance",
    updatedAt: "2026-06-16",
    words: 350,
    summary:
      "How the community can participate in classification and threshold evolution.",
    Content: () => (
      <>
        <p>
          Liquidity thresholds, trading activity requirements, and classification
          parameters may evolve through governance as the ecosystem matures.
        </p>
        <p>
          Community voting allows Walking Deadcoins to be evaluated and, when
          appropriate, classified as Community Deadcoins.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART V — IDENTITY & TRANSPARENCY
  // ============================================================

  {
    slug: "identity-layer",
    title: "Identity Layer",
    updatedAt: "2026-06-16",
    words: 450,
    summary:
      "Why Coincarnation recognizes people rather than isolated wallet addresses.",
    Content: () => (
      <>
        <p>
          Coincarnation is designed to recognize people rather than wallet
          addresses.
        </p>

        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse border border-white/10 text-sm">
            <tbody>
              {[
                ["Traditional Web3", "Coincarnation"],
                ["Wallet-Centric", "Identity-Centric"],
                ["Isolated Addresses", "Unified Participation"],
                ["Fragmented Reputation", "Persistent Reputation"],
                ["Wallet-Based Rewards", "Identity-Based Recognition"],
              ].map(([a, b], i) => (
                <tr key={a} className={i === 0 ? "bg-white/5 font-semibold" : ""}>
                  <td className="border border-white/10 px-3 py-2">{a}</td>
                  <td className="border border-white/10 px-3 py-2">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },

  {
    slug: "proof-ledger",
    title: "Proof Ledger",
    updatedAt: "2026-06-16",
    words: 300,
    summary:
      "A transparent record of recognized contributions and reversals.",
    Content: () => (
      <>
        <p>
          The Proof Ledger records recognized ecosystem activity such as
          Coincarnation contributions, referrals, sharing activity, deadcoin
          recognition, and future contribution categories.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART VI — PROOF OF VALUE
  // ============================================================

  {
    slug: "proof-of-value",
    title: "Proof of Value Framework",
    updatedAt: "2026-06-16",
    words: 650,
    summary:
      "A framework for recognizing measurable forms of contribution.",
    Content: () => (
      <>
        <p>
          Proof of Value does not attempt to measure the total worth of a human
          being. It attempts to recognize measurable forms of contribution.
        </p>

        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse border border-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="border border-white/10 px-3 py-2 text-left">Consensus System</th>
                <th className="border border-white/10 px-3 py-2 text-left">Recognizes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Proof of Work", "Computation"],
                ["Proof of Stake", "Capital"],
                ["Proof of Authority", "Authority"],
                ["Proof of History", "Time"],
                ["Proof of Liquidity", "Liquidity"],
                ["Proof of Value", "Contribution"],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td className="border border-white/10 px-3 py-2">{a}</td>
                  <td className="border border-white/10 px-3 py-2">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },

  // ============================================================
  // PART VII — PERSONAL VALUE CURRENCY
  // ============================================================

  {
    slug: "personal-value-currency",
    title: "Personal Value Currency",
    updatedAt: "2026-06-16",
    words: 700,
    summary:
      "PVC as accumulated recognized contribution, economic identity, and future rights framework.",
    Content: () => (
      <>
        <p>
          Personal Value Currency (PVC) represents an individual&apos;s
          accumulated and recognized contribution within the Proof of Value
          framework. Over time, PVC may serve as a foundation for governance
          participation, opportunity access, ecosystem benefits, and future
          economic rights.
        </p>
      </>
    ),
  },

  {
    slug: "future-pvc-sources",
    title: "Future PVC Sources",
    updatedAt: "2026-06-16",
    words: 350,
    summary:
      "How Proof of Value may expand into new measurable contribution categories.",
    Content: () => (
      <>
        <p>
          Coincarnation does not assume that value originates from a single
          source. Therefore, the Proof of Value framework is designed to evolve as
          new forms of contribution become measurable.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART VIII — MEGY
  // ============================================================

  {
    slug: "megy",
    title: "MEGY",
    updatedAt: "2026-06-16",
    words: 500,
    summary:
      "MEGY as the common economic medium of the Levershare ecosystem.",
    Content: () => (
      <>
        <p>
          MEGY and PVC are designed to be complementary rather than competitive.
          MEGY supports ecosystem-wide economic activity, while PVC provides a
          framework for recognizing individual contribution.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART IX — TOKENOMICS
  // ============================================================

  {
    slug: "tokenomics",
    title: "Tokenomics",
    updatedAt: "2026-06-16",
    words: 500,
    summary:
      "MEGY supply, allocation philosophy, and Proof-of-Value-based release.",
    Content: () => (
      <>
        <p>
          MEGY enters circulation gradually as Proof of Value conditions are
          satisfied across the ecosystem.
        </p>

        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse border border-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="border border-white/10 px-3 py-2 text-left">Allocation</th>
                <th className="border border-white/10 px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Coincarnation Rewards", "75"],
                ["Fair Future Fund Reserve", "5"],
                ["Liquidity", "5"],
                ["Partnerships & Ecosystem Growth", "10"],
                ["Team & Contributors", "5"],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td className="border border-white/10 px-3 py-2">{a}</td>
                  <td className="border border-white/10 px-3 py-2 text-right">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },

  // ============================================================
  // PART X — FAIR FUTURE FUND
  // ============================================================

  {
    slug: "fair-future-fund",
    title: "Fair Future Fund",
    updatedAt: "2026-06-16",
    words: 700,
    summary:
      "A global opportunity fund designed to manage and grow collectively accumulated capital.",
    Content: () => (
      <>
        <p>
          The Fair Future Fund is designed to transform collectively accumulated
          capital into long-term opportunity through professional capital
          allocation.
        </p>
        <p>
          At least 25% of realized fund returns must be reinvested into the Fair
          Future Fund. The allocation of the remaining portion may be determined
          through governance mechanisms active at the time.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART XI — GOVERNANCE
  // ============================================================

  {
    slug: "governance",
    title: "Governance",
    updatedAt: "2026-06-16",
    words: 450,
    summary:
      "PVC-weighted participation, fund decisions, distribution policy, and ecosystem governance.",
    Content: () => (
      <>
        <p>
          Influence within the ecosystem should not emerge solely from capital
          ownership. Participation, contribution, and value creation may also
          deserve representation.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART XII — RISK MANAGEMENT
  // ============================================================

  {
    slug: "risk-management",
    title: "Risk Management & Safeguards",
    updatedAt: "2026-06-16",
    words: 500,
    summary:
      "Classification safeguards, redlist/blacklist controls, transparency, and abuse prevention.",
    Content: () => (
      <>
        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse border border-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="border border-white/10 px-3 py-2 text-left">Risk</th>
                <th className="border border-white/10 px-3 py-2 text-left">Safeguard</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Asset Misclassification", "Community Classification"],
                ["Malicious Participation", "Redlist / Blacklist"],
                ["Governance Concentration", "PVC-Based Participation"],
                ["Treasury Mismanagement", "Transparency & Reporting"],
                ["Ecosystem Manipulation", "Community Oversight"],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td className="border border-white/10 px-3 py-2">{a}</td>
                  <td className="border border-white/10 px-3 py-2">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },

  // ============================================================
  // PART XIII — ROADMAP
  // ============================================================

  {
    slug: "roadmap",
    title: "Roadmap",
    updatedAt: "2026-06-16",
    words: 450,
    summary:
      "Near-term launch phases and long-term capability-based development.",
    Content: () => (
      <>
        <p>
          Coincarnation is designed as a long-term economic experiment rather
          than a short-term product launch.
        </p>
      </>
    ),
  },

  // ============================================================
  // PART XIV — CLOSING VISION
  // ============================================================

  {
    slug: "closing-vision",
    title: "Closing Vision",
    updatedAt: "2026-06-16",
    words: 300,
    summary:
      "The long-term vision of capital formation, value recognition, and opportunity distribution.",
    Content: () => (
      <>
        <p>
          Coincarnation was not created to build another token economy. It was
          created to explore whether access to capital formation, value
          recognition, and economic opportunity can become more broadly
          distributed.
        </p>
      </>
    ),
  },
];