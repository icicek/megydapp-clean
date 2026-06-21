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
          Coincarnation is a capital formation framework designed to transform
          existing digital assets into productive capital while recognizing
          meaningful participation through the Proof of Value system.
        </p>

        <p>
          The project explores a simple idea:
          economic opportunity should not be limited by existing capital ownership.
        </p>

        <p>
          Rather than relying on traditional fundraising mechanisms, Coincarnation
          enables participants to contribute eligible digital assets that can be
          transformed into capital for long-term ecosystem development.
        </p>

        <p>
          Capital accumulated through Coincarnation may support the development of
          the Fair Future Fund (FFF), a long-term opportunity fund designed to
          preserve, manage, and grow capital through diversified investment
          activities.
        </p>

        <p>
          Participation within the ecosystem is recognized through the Proof of
          Value (PoV) framework. PoV measures recognized forms of contribution and
          records them as CorePoints (CP).
        </p>

        <p>
          CorePoints collectively form Personal Value Currency (PVC), a framework
          designed to make contribution visible and to support future governance,
          opportunity access, ecosystem benefits, and economic participation.
        </p>

        <p>
          MEGY serves as the primary economic asset of the ecosystem.
          Unlike traditional fixed-release models, MEGY enters circulation only
          when Proof of Value conditions are satisfied.
        </p>

        <p>
          Coincarnation creates capital.
          The Fair Future Fund manages and grows it.
          Proof of Value recognizes contribution.
          Personal Value Currency distributes opportunity.
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
          Over the past century, economic development has generated unprecedented
          levels of wealth, technological progress, and productivity.
          Yet access to economic opportunity remains unevenly distributed across
          societies and regions.
        </p>

        <p>
          While many factors contribute to inequality, access to capital remains one
          of the most significant.
          Individuals who own productive assets often benefit from investment
          returns, ownership structures, and long-term appreciation.
          Those without capital frequently face barriers to participating in these
          same opportunities.
        </p>

        <p>
          As a result, economic growth does not always translate into equal access
          to wealth creation.
        </p>

        <p>
          Coincarnation begins with a simple question:
        </p>

        <blockquote>
          What if access to capital formation could become more broadly distributed?
        </blockquote>

        <p>
          The project does not claim to solve global inequality.
          Nor does it suggest that capital formation alone can eliminate economic
          disparities.
        </p>

        <p>
          Instead, Coincarnation explores whether participation itself can become a
          pathway toward future economic opportunity.
        </p>

        <p>
          The project is built on the belief that economic opportunity should not be
          limited solely by existing capital ownership.
          It seeks to create additional mechanisms through which individuals can
          participate in future value creation regardless of their starting point.
        </p>

        <p>
          This objective serves as the foundation for the broader Coincarnation
          ecosystem, the Fair Future Fund, the Proof of Value framework, and the
          Personal Value Currency system.
        </p>

        <pre>
      {`Global Inequality
              ↓
      Capital Access Problem
              ↓
      Need for Capital Formation
              ↓
      Coincarnation
              ↓
      Fair Future Fund
              ↓
      Global Capital Returns
              ↓
      Proof of Value
              ↓
      PVC
              ↓
      Opportunity Distribution`}
        </pre>

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

        <p>
          Coincarnation is built upon a set of foundational beliefs that guide its
          long-term development.
        </p>

        <p>
          These beliefs are not intended to describe the world as it is.
          They describe the direction in which the project seeks to explore and
          evolve.
        </p>

        <h3>Economic Opportunity Should Not Be Limited by Existing Capital Ownership</h3>

        <p>
          Access to economic opportunity is often influenced by access to capital.
          Individuals who already possess productive assets frequently benefit from
          ownership and investment returns, while others face substantial barriers
          to participation.
        </p>

        <p>
          Coincarnation explores whether additional pathways toward economic
          opportunity can emerge through participation, contribution, and capital
          formation.
        </p>

        <blockquote>
          Economic opportunity should not be limited by existing capital ownership.
        </blockquote>

        <h3>Capital Formation Can Become More Inclusive</h3>

        <p>
          Traditional capital formation mechanisms often depend upon concentrated
          pools of capital, institutional access, or private investment networks.
        </p>

        <p>
          Coincarnation explores whether capital formation can occur through a
          broader and more globally distributed participation model.
        </p>

        <blockquote>
          Capital formation can become more inclusive.
        </blockquote>

        <h3>Contribution Matters</h3>

        <p>
          Economic systems recognize many forms of capital.
          Coincarnation proposes that measurable forms of contribution should also
          become visible within economic systems.
        </p>

        <p>
          This principle serves as the foundation of the Proof of Value framework.
        </p>

        <blockquote>
          Contribution matters.
        </blockquote>

        <h3>Recognition and Accountability Must Coexist</h3>

        <p>
          Contribution recognition should never be unconditional.
        </p>

        <p>
          Participation must remain transparent, verifiable, and subject to review
          when manipulation, abuse, fraud, or other harmful behaviors are detected.
        </p>

        <p>
          For this reason, recognized contributions may be adjusted, reversed, or
          removed when necessary to preserve ecosystem integrity.
        </p>

        <blockquote>
          Recognition and accountability must coexist.
        </blockquote>

        <h3>Value Creation and Economic Participation Can Be Reconnected</h3>

        <p>
          Throughout history, value creation and economic participation have evolved
          through many different systems and institutions.
        </p>

        <p>
          Coincarnation explores whether measurable contribution can once again play
          a more visible role in determining access to future opportunity.
        </p>

        <blockquote>
          Value creation and economic participation can be brought closer together.
        </blockquote>

        <h3>Economic Systems Should Continue to Evolve</h3>

        <p>
          Coincarnation does not assume that every meaningful contribution can be
          measured today.
        </p>

        <p>
          The project begins with contribution types that can be objectively
          recognized and verified.
        </p>

        <p>
          As measurement systems improve, additional forms of contribution may
          become eligible for recognition through the Proof of Value framework.
        </p>

        <blockquote>
          The future may recognize more forms of value than the present.
        </blockquote>
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
          Coincarnation began with a simple observation:
          access to capital often determines access to opportunity.
        </p>

        <p>
          Throughout history, individuals have created value through labor,
          knowledge, creativity, entrepreneurship, cooperation, and innovation.
          Yet participation in long-term capital growth has frequently remained
          concentrated among those who already possess capital.
        </p>

        <p>
          Coincarnation explores whether this relationship can evolve.
        </p>

        <blockquote>
          Can value creation and economic participation be brought closer together again?
        </blockquote>

        <p>
          The project does not seek to replace existing economic systems.
          Nor does it claim that capital formation alone can solve complex social and
          economic challenges.
        </p>

        <p>
          Instead, Coincarnation seeks to create an additional pathway through which
          individuals may participate in future opportunity creation.
        </p>

        <p>
          At its core, Coincarnation is not merely a token project.
          It is a framework designed to explore new relationships between
          participation, contribution, capital formation, and opportunity.
        </p>

        <h3>Capital Formation as a Starting Point</h3>

        <p>
          Coincarnation views capital formation not as an end goal, but as a starting
          point.
        </p>

        <p>
          The project recognizes that long-term opportunity often depends upon the
          existence of productive capital.
          Without capital, investment opportunities remain limited.
          Without investment opportunities, future value creation becomes more
          difficult.
        </p>

        <p>
          For this reason, Coincarnation focuses first on capital formation.
        </p>

        <h3>From Capital Formation to Opportunity</h3>

        <p>
          Capital accumulated through Coincarnation may contribute to the development
          of the Fair Future Fund (FFF).
        </p>

        <p>
          The Fair Future Fund is designed to preserve, manage, and grow capital
          through diversified long-term allocation strategies.
        </p>

        <p>
          As capital grows, new forms of opportunity may emerge.
        </p>

        <p>
          These opportunities may take many forms, including future distributions,
          ecosystem benefits, governance participation, collaborative initiatives,
          and additional value-generating activities that may emerge over time.
        </p>

        <h3>The Role of Proof of Value</h3>

        <p>
          Opportunity alone does not determine how participation should be recognized.
        </p>

        <p>
          Coincarnation therefore introduces the Proof of Value framework.
        </p>

        <p>
          Proof of Value seeks to recognize measurable forms of contribution and make
          them visible within the ecosystem.
        </p>

        <p>
          Rather than focusing exclusively on capital ownership, the framework seeks
          to acknowledge participation and contribution as meaningful components of
          economic activity.
        </p>

        <h3>The Role of Personal Value Currency</h3>

        <p>
          Contributions recognized through the Proof of Value framework accumulate as
          Personal Value Currency (PVC).
        </p>

        <p>
          PVC is not designed to represent the total worth of an individual.
          Instead, it represents contribution that has been recognized within the
          ecosystem.
        </p>

        <p>
          Over time, PVC may become a foundation for governance participation,
          opportunity access, ecosystem benefits, and future economic rights.
        </p>

        <h3>A Long-Term Economic Experiment</h3>

        <p>
          Coincarnation is designed as a long-term economic experiment rather than a
          short-term product launch.
        </p>

        <p>
          The project seeks to explore whether capital formation, value recognition,
          and opportunity distribution can become more broadly accessible without
          sacrificing transparency, accountability, or economic sustainability.
        </p>

        <blockquote>
          Coincarnation creates capital.
          The Fair Future Fund manages and grows it.
          Proof of Value recognizes contribution.
          Personal Value Currency distributes opportunity.
        </blockquote>

        <p>
          Together, these components form a single framework designed to connect
          participation, contribution, capital formation, and future opportunity.
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
          Most blockchain projects begin with a fundraising event.
        </p>

        <p>
          Whether through token sales, private rounds, venture capital financing,
          launchpads, or other allocation mechanisms, the objective is typically the
          same: collect new capital from participants in exchange for future
          expectations.
        </p>

        <p>
          Coincarnation follows a different path.
        </p>

        <blockquote>
          Coincarnation does not seek to create value from promises.
          It seeks to transform existing value into future opportunity.
        </blockquote>

        <h3>Rethinking Capital Formation</h3>

        <p>
          Traditional fundraising models depend upon participants allocating new
          capital into a project.
        </p>

        <p>
          Coincarnation explores whether capital formation can occur through the
          transformation of digital assets that already exist.
        </p>

        <p>
          Instead of asking participants to commit entirely new resources,
          Coincarnation allows eligible digital assets to become part of a broader
          capital formation process.
        </p>

        <p>
          These assets may range from highly active digital assets to assets that
          have lost most of their practical utility over time.
        </p>

        <p>
          The objective is not capital collection.
        </p>

        <p>
          The objective is capital transformation.
        </p>

        <h3>Traditional Fundraising vs Coincarnation</h3>

        <div className="overflow-x-auto my-6">
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

        <h3>Recovery-Oriented Participation</h3>

        <p>
          A distinctive characteristic of Coincarnation is that participation often
          begins with assets that participants already own.
        </p>

        <p>
          Traditional fundraising asks participants to commit additional capital and
          build entirely new expectations.
        </p>

        <p>
          Coincarnation allows participants to re-evaluate assets that already exist
          within their portfolios and transform them into participation within a
          broader economic ecosystem.
        </p>

        <p>
          In many cases, this creates a fundamentally different psychological
          dynamic.
        </p>

        <p>
          Rather than beginning from a new speculative position, participants may
          begin from assets that were acquired long before Coincarnation existed.
        </p>

        <p>
          Some participants may view this process as an opportunity to reconnect
          with value that had previously been considered inactive, forgotten, or
          economically irrelevant.
        </p>

        <h3>From Digital Assets to Productive Capital</h3>

        <p>
          Coincarnation accepts that digital assets exist across a wide spectrum of
          economic activity.
        </p>

        <p>
          Some remain highly active.
          Some continue to trade despite declining relevance.
          Others have effectively ceased meaningful economic participation.
        </p>

        <p>
          Rather than evaluating assets exclusively through the lens of market
          speculation, Coincarnation evaluates whether they can contribute to
          capital formation within the ecosystem.
        </p>

        <pre className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm overflow-x-auto my-6">
      {`Digital Assets
              ↓
      Coincarnation
              ↓
      Productive Capital
              ↓
      Fair Future Fund
              ↓
      Investment Returns
              ↓
      Opportunity Distribution`}
        </pre>

        <p>
          Coincarnation therefore functions as a bridge between existing digital
          assets and future opportunity creation.
        </p>

        <p>
          The long-term objective is not simply to collect assets.
        </p>

        <p>
          The objective is to create the foundations of a growing opportunity
          ecosystem.
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
        <section className="space-y-6">
          <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              Key idea
            </p>
            <h3 className="mt-2 text-xl font-bold">
              Classification recognizes economic reality, not project popularity.
            </h3>
            <p className="mt-3 text-sm text-white/70">
              Coincarnation evaluates assets by their observable economic condition:
              activity, liquidity, treasury relevance, and community classification.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Healthy", "High activity", "MEGY + CP", "Treasury eligible"],
              ["Walking Deadcoin", "Declining activity", "MEGY + CP", "Conditional"],
              ["Deadcoin", "No activity", "CP only", "No treasury value"],
              ["Community Deadcoin", "Community classified", "CP only", "Recognition only"],
            ].map(([title, activity, reward, treasury]) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="text-sm font-bold">{title}</div>
                <div className="mt-3 space-y-2 text-xs text-white/65">
                  <p>
                    <span className="text-white/40">Activity:</span> {activity}
                  </p>
                  <p>
                    <span className="text-white/40">Reward:</span> {reward}
                  </p>
                  <p>
                    <span className="text-white/40">Treasury:</span> {treasury}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left">Classification</th>
                  <th className="px-4 py-3 text-left">Economic Activity</th>
                  <th className="px-4 py-3 text-left">Treasury Eligibility</th>
                  <th className="px-4 py-3 text-left">Reward</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Healthy", "High", "Eligible", "MEGY + CP"],
                  ["Walking Deadcoin", "Moderate", "Conditional", "MEGY + CP"],
                  ["Deadcoin", "None", "No", "CP Only"],
                  ["Community Deadcoin", "Community Determined", "No", "CP Only"],
                ].map(([a, b, c, d]) => (
                  <tr key={a} className="border-t border-white/10">
                    <td className="px-4 py-3 font-semibold">{a}</td>
                    <td className="px-4 py-3 text-white/70">{b}</td>
                    <td className="px-4 py-3 text-white/70">{c}</td>
                    <td className="px-4 py-3 text-white/70">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <h3 className="text-lg font-semibold">Treasury decision flow</h3>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <div className="font-semibold text-emerald-100">Healthy</div>
                <p className="mt-2 text-sm text-white/70">
                  May be retained, allocated, or converted as a treasury-relevant asset.
                </p>
              </div>

              <div className="rounded-xl border border-orange-400/20 bg-orange-400/10 p-4">
                <div className="font-semibold text-orange-100">Walking Deadcoin</div>
                <p className="mt-2 text-sm text-white/70">
                  Evaluated conditionally. Weak or inefficient assets may be converted
                  into stronger reserves.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-400/20 bg-zinc-400/10 p-4">
                <div className="font-semibold text-zinc-100">Deadcoin</div>
                <p className="mt-2 text-sm text-white/70">
                  No treasury value. Recognized through CorePoints only.
                </p>
              </div>

              <div className="rounded-xl border border-purple-400/20 bg-purple-400/10 p-4">
                <div className="font-semibold text-purple-100">Community Deadcoin</div>
                <p className="mt-2 text-sm text-white/70">
                  Classified through community participation and recognized through CP only.
                </p>
              </div>
            </div>
          </div>

          <blockquote className="rounded-2xl border-l-4 border-cyan-300 bg-white/[0.04] p-5 text-lg font-semibold">
            Economic reality matters more than popularity.
          </blockquote>
        </section>
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