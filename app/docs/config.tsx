// app/docs/config.tsx
import React from "react";
import InsightQuote from "./components/InsightQuote";

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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Foundational Beliefs
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Coincarnation begins with a different view of economic opportunity.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                These beliefs do not describe the world as it is. They describe the
                direction Coincarnation seeks to explore: broader access to capital
                formation, contribution recognition, and future opportunity.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Economic opportunity should not be limited by existing capital ownership.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Belief cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [
                "Opportunity",
                "Economic opportunity should be more accessible.",
                "Capital ownership should not be the only pathway toward future participation.",
              ],
              [
                "Contribution",
                "Value creation should become visible.",
                "Measurable forms of contribution deserve recognition within the ecosystem.",
              ],
              [
                "Accountability",
                "Recognition must be protected from abuse.",
                "Fraud, manipulation, and harmful behavior may lead to reversal or removal.",
              ],
            ].map(([label, title, desc]) => (
              <div
                key={label}
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                  {label}
                </p>
                <h3 className="mt-3 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{desc}</p>
              </div>
            ))}
          </div>

          {/* Core beliefs matrix */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Core belief matrix
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                The principles behind Coincarnation
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Belief</th>
                    <th className="px-4 py-3 text-left">Meaning</th>
                    <th className="px-4 py-3 text-left">System Layer</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Capital formation can become more inclusive",
                      "Participation can help create access to future opportunity",
                      "Coincarnation",
                    ],
                    [
                      "Contribution matters",
                      "Measurable value creation should be recognized",
                      "Proof of Value",
                    ],
                    [
                      "Recognition and accountability must coexist",
                      "Recognized contribution must remain reviewable",
                      "Proof Ledger",
                    ],
                    [
                      "Opportunity can generate more opportunity",
                      "Economic access can lead to new forms of value creation",
                      "PVC / FFF",
                    ],
                  ].map(([a, b, c]) => (
                    <tr key={a} className="border-t border-white/10">
                      <td className="px-4 py-3 font-semibold">{a}</td>
                      <td className="px-4 py-3 text-white/70">{b}</td>
                      <td className="px-4 py-3 text-white/70">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual equation */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Belief flow
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Value Creation", "People create value"],
                ["Recognition", "Contribution becomes visible"],
                ["Capital Formation", "Participation builds capital"],
                ["Opportunity", "Capital creates access"],
                ["More Value Creation", "Opportunity expands participation"],
              ].map(([title, subtitle]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center"
                >
                  <div className="text-sm font-bold">{title}</div>
                  <div className="mt-2 text-xs text-white/55">{subtitle}</div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <InsightQuote>
                Value creation and economic participation can be brought closer together.
              </InsightQuote>
            </div>
          </div>

          {/* What this does not mean */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                What this means
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Participation can create economic visibility.",
                  "Contribution can become part of future opportunity.",
                  "Capital formation can be explored through distributed participation.",
                ].map((x) => (
                  <div
                    key={x}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75"
                  >
                    {x}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/70">
                What this does not mean
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "It does not promise equal outcomes.",
                  "It does not claim to measure the total worth of a human being.",
                  "It does not remove the need for accountability.",
                ].map((x) => (
                  <div
                    key={x}
                    className="rounded-2xl border border-red-300/20 bg-black/20 px-4 py-3 text-sm text-white/75"
                  >
                    {x}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Final quote */}
          <div className="rounded-3xl border border-cyan-400/20 bg-black/30 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Foundational principle
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              The future may recognize more forms of value than the present.
            </blockquote>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Coincarnation begins with contribution types that can be objectively
              recognized and verified. As measurement systems improve, additional
              forms of contribution may become eligible for recognition through the
              Proof of Value framework.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 via-indigo-500/10 to-cyan-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-200/80">
                Coincarnation Philosophy
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Can value creation and economic participation be brought closer together again?
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Coincarnation is designed as a long-term economic experiment that
                connects participation, contribution, capital formation, and future
                opportunity.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Coincarnation was not created to build another token economy.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Philosophy map */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Philosophy map
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              From participation to opportunity
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Participation", "People enter through action"],
                ["Contribution", "Measurable value is recognized"],
                ["Capital Formation", "Existing value becomes productive"],
                ["Capital Growth", "FFF manages and grows capital"],
                ["Opportunity", "PVC helps distribute access"],
              ].map(([title, subtitle]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center"
                >
                  <div className="text-sm font-bold">{title}</div>
                  <div className="mt-2 text-xs text-white/55">{subtitle}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Key idea + contrast */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Core question
              </p>
              <blockquote className="mt-4 text-xl font-bold leading-snug">
                What if participation could become a pathway toward future economic opportunity?
              </blockquote>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                Coincarnation does not claim that every economic problem can be
                solved through capital formation. It explores whether broader access
                to capital formation can create new pathways toward opportunity.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                What Coincarnation is not
              </p>

              <div className="mt-4 space-y-2">
                {[
                  ["Not a promise machine", "It does not create value from hype."],
                  ["Not a short-term launch", "It is designed as a long-term economic experiment."],
                  ["Not only a token economy", "MEGY is important, but it is not the whole system."],
                ].map(([title, desc]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="text-sm font-bold">{title}</div>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System components */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                System logic
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Four components, one economic framework
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Component</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Coincarnation", "Creates capital", "Transforms eligible digital assets into productive capital"],
                    ["Fair Future Fund", "Manages and grows capital", "Allocates capital through disciplined long-term strategies"],
                    ["Proof of Value", "Recognizes contribution", "Makes measurable participation visible"],
                    ["PVC", "Distributes opportunity", "Connects recognized contribution to future rights and access"],
                  ].map(([a, b, c]) => (
                    <tr key={a} className="border-t border-white/10">
                      <td className="px-4 py-3 font-semibold">{a}</td>
                      <td className="px-4 py-3 text-white/70">{b}</td>
                      <td className="px-4 py-3 text-white/70">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Main equation */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Core equation
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Coincarnation", "creates capital"],
                ["FFF", "manages and grows it"],
                ["PoV", "recognizes contribution"],
                ["PVC", "distributes opportunity"],
              ].map(([title, subtitle]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center"
                >
                  <div className="text-sm font-black">{title}</div>
                  <div className="mt-2 text-xs text-white/60">{subtitle}</div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <InsightQuote>
                Coincarnation creates capital. Fair Future Fund manages and grows it. Proof of Value recognizes contribution. Personal Value Currency distributes opportunity.
              </InsightQuote>
            </div>
          </div>

          {/* Final note */}
          <div className="rounded-3xl border border-cyan-400/20 bg-black/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Long-term orientation
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              Coincarnation is designed as a long-term economic experiment rather than a short-term product launch.
            </blockquote>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              The project seeks to explore whether capital formation, value
              recognition, and opportunity distribution can become more broadly
              accessible without sacrificing transparency, accountability, or
              economic sustainability.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Capital Formation
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Capital formation without traditional fundraising.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Coincarnation does not begin by asking participants to commit new
                capital. It begins by transforming existing digital assets into
                recognized participation and future opportunity.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Existing value can become future opportunity.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Transformation map */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Transformation map
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              From existing assets to future opportunity
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Existing Digital Assets", "Previously held value"],
                ["Coincarnation", "Transformation process"],
                ["Productive Capital", "Capital formation"],
                ["Fair Future Fund", "Management & growth"],
                ["Future Opportunity", "Distribution potential"],
              ].map(([title, subtitle]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center"
                >
                  <div className="text-sm font-bold">{title}</div>
                  <div className="mt-2 text-xs text-white/55">{subtitle}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Main quote */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Key idea
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              Coincarnation does not seek to create value from promises.
              It seeks to transform existing value into future opportunity.
            </blockquote>
          </div>

          {/* Traditional vs Coincarnation */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Structural difference
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Traditional token sale vs Coincarnation
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Traditional Token Sale</th>
                    <th className="px-4 py-3 text-left">Coincarnation</th>
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
                    <tr key={a} className="border-t border-white/10">
                      <td className="px-4 py-3 text-white/70">{a}</td>
                      <td className="px-4 py-3 font-semibold">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Capital collection vs formation */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Common model
              </p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-center text-xl font-black">New capital</div>
                <div className="my-3 text-center text-2xl text-white/30">↓</div>
                <div className="text-center text-xl font-black">New risk</div>
                <div className="my-3 text-center text-2xl text-white/30">↓</div>
                <div className="text-center text-xl font-black">New expectations</div>
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Coincarnation model
              </p>
              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-black/20 p-5">
                <div className="text-center text-xl font-black">Existing asset</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↓</div>
                <div className="text-center text-xl font-black">Recognition</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↓</div>
                <div className="text-center text-xl font-black">
                  Recovery-oriented participation
                </div>
              </div>
            </div>
          </div>

          {/* Key idea */}
          <blockquote className="rounded-3xl border-l-4 border-cyan-300 bg-white/[0.04] p-5 text-xl font-bold">
            Capital collection and capital formation are not the same thing.
          </blockquote>

          {/* Augmented Airdrop */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Investor recovery
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Traditional airdrop vs Coincarnation Augmented Airdrop
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Traditional Airdrop</th>
                    <th className="px-4 py-3 text-left">
                      Coincarnation Augmented Airdrop
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Immediate Token Distribution", "Long-Term Participation Rights"],
                    ["Sell and Exit", "Accumulate and Grow"],
                    ["Temporary Engagement", "Persistent Alignment"],
                    ["Speculative Reward", "Value Recognition"],
                    ["User Acquisition", "Community Formation"],
                  ].map(([a, b]) => (
                    <tr key={a} className="border-t border-white/10">
                      <td className="px-4 py-3 text-white/70">{a}</td>
                      <td className="px-4 py-3 font-semibold">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final quote */}
          <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Final idea
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              Coincarnation transforms existing value into productive capital,
              and participation into recognized contribution.
            </blockquote>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 via-cyan-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-indigo-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200/80">
                Coincarnation Protocol
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Coincarnation transforms asset participation into recognized contribution.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                The protocol connects eligible digital assets, classification, treasury
                logic, Proof of Value recognition, CorePoints, PVC, and MEGY distribution
                into a single participation lifecycle.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Participation becomes recognition.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Lifecycle diagram */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Protocol lifecycle
            </p>
            <h3 className="mt-1 text-lg font-semibold">From asset submission to future opportunity</h3>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["1", "Asset Submission", "A Coincarnator brings an eligible digital asset."],
                ["2", "Classification", "The asset is evaluated by economic condition."],
                ["3", "Coincarnation", "The asset enters the contribution process."],
                ["4", "Recognition", "Contribution is recorded through Proof of Value."],
              ].map(([step, title, desc]) => (
                <div key={step} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-xs font-bold text-cyan-100">
                    {step}
                  </div>
                  <div className="mt-3 text-sm font-bold">{title}</div>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">{desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
              <pre className="overflow-x-auto text-xs leading-relaxed text-white/70">
    {`Asset
      ↓
    Classification
      ↓
    Coincarnation
      ↓
    Proof of Value Recognition
      ↓
    CorePoints
      ↓
    PVC
      ↓
    Future Opportunity`}
              </pre>
            </div>
          </div>

          {/* Key idea + reward architecture */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Key idea
              </p>
              <blockquote className="mt-4 text-xl font-bold leading-snug">
                Coincarnation is not merely an asset transfer process. It is a participation recognition process.
              </blockquote>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                The protocol recognizes what the participant contributes, not merely
                what the asset used to represent.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Recognition architecture
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-center text-sm font-bold">Coincarnation</div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/10 p-4 text-center">
                    <div className="text-sm font-bold text-indigo-100">MEGY</div>
                    <p className="mt-2 text-xs text-white/60">
                      Participation reward
                    </p>
                  </div>

                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-center">
                    <div className="text-sm font-bold text-cyan-100">CorePoints</div>
                    <p className="mt-2 text-xs text-white/60">
                      Contribution recognition
                    </p>
                  </div>
                </div>

                <div className="mt-4 text-center text-xl text-white/30">↓</div>

                <div className="mx-auto mt-2 max-w-xs rounded-2xl border border-purple-400/20 bg-purple-400/10 p-4 text-center">
                  <div className="text-sm font-bold text-purple-100">PVC</div>
                  <p className="mt-2 text-xs text-white/60">
                    Accumulated recognized contribution
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Protocol outcome table */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Protocol outcomes
              </p>
              <h3 className="mt-1 text-lg font-semibold">What Coincarnation may produce</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Output</th>
                    <th className="px-4 py-3 text-left">Function</th>
                    <th className="px-4 py-3 text-left">Layer</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["MEGY", "Economic asset distributed under active rules", "Ecosystem economy"],
                    ["CorePoints", "Accounting unit for recognized contribution", "Proof of Value"],
                    ["PVC", "Accumulated recognized contribution", "Economic identity"],
                    ["Treasury Assets", "Capital base for future allocation", "Fair Future Fund"],
                  ].map(([a, b, c]) => (
                    <tr key={a} className="border-t border-white/10">
                      <td className="px-4 py-3 font-semibold">{a}</td>
                      <td className="px-4 py-3 text-white/70">{b}</td>
                      <td className="px-4 py-3 text-white/70">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phase-based distribution */}
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Phase-based distribution
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              MEGY is released through participation, not a fixed calendar.
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["Phase 1", "Initial allocation", "First live participation data"],
                ["Phase 2", "Adjusted allocation", "Conversion rate evolves"],
                ["Future phases", "Dynamic allocation", "Participation-driven sustainability"],
              ].map(([phase, allocation, note]) => (
                <div key={phase} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-sm font-bold">{phase}</div>
                  <div className="mt-2 text-xs font-semibold text-cyan-100/80">{allocation}</div>
                  <p className="mt-3 text-xs leading-relaxed text-white/60">{note}</p>
                </div>
              ))}
            </div>

            <blockquote className="mt-5 rounded-2xl border-l-4 border-cyan-300 bg-white/[0.04] p-5 text-lg font-semibold">
              MEGY is not released according to a fixed schedule. It is released according to recognized participation.
            </blockquote>
          </div>

          {/* Capital flow */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Capital flow
            </p>
            <h3 className="mt-2 text-xl font-bold">
              From digital assets to future opportunity
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Digital Assets", "Existing value"],
                ["Coincarnation", "Transformation"],
                ["Productive Capital", "Capital base"],
                ["Fair Future Fund", "Management & growth"],
                ["Opportunity", "Distribution layer"],
              ].map(([title, subtitle]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                  <div className="text-sm font-bold">{title}</div>
                  <div className="mt-2 text-xs text-white/55">{subtitle}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <blockquote className="text-xl font-black leading-tight">
                Coincarnation transforms existing value into productive capital,
                and participation into recognized contribution.
              </blockquote>
            </div>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero / Key idea */}
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-500/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Asset Classification Framework
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Classification recognizes economic reality, not project popularity.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Coincarnation classifies assets by observable economic condition:
                activity, liquidity, treasury relevance, and community recognition.
                The objective is to understand what an asset can contribute to the
                ecosystem today.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Economic reality matters more than popularity.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Hero diagram */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                  Classification map
                </p>
                <h3 className="mt-1 text-lg font-semibold">From digital assets to recognition</h3>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_2fr] md:items-center">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm font-bold">Digital Assets</div>
                <p className="mt-2 text-xs text-white/55">
                  Any eligible asset entering Coincarnation
                </p>
              </div>

              <div className="hidden text-2xl text-white/30 md:block">→</div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Healthy", "High activity", "MEGY + CP", "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"],
                  ["Walking Deadcoin", "Declining activity", "MEGY + CP", "border-orange-400/20 bg-orange-400/10 text-orange-100"],
                  ["Deadcoin", "No activity", "CP only", "border-zinc-400/20 bg-zinc-400/10 text-zinc-100"],
                  ["Community Deadcoin", "Community classified", "CP only", "border-purple-400/20 bg-purple-400/10 text-purple-100"],
                ].map(([title, subtitle, reward, cls]) => (
                  <div key={title} className={`rounded-2xl border p-4 ${cls}`}>
                    <div className="text-sm font-bold">{title}</div>
                    <div className="mt-2 text-xs opacity-80">{subtitle}</div>
                    <div className="mt-3 rounded-full bg-black/20 px-3 py-1 text-[11px] font-semibold">
                      {reward}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Popularity vs economic activity */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                What classification is not
              </p>
              <div className="mt-4 flex items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="text-center">
                  <div className="text-2xl font-black text-white/90">Popularity</div>
                  <div className="mt-1 text-xs text-white/45">hype, attention, noise</div>
                </div>
                <div className="text-3xl font-black text-cyan-200">≠</div>
                <div className="text-center">
                  <div className="text-2xl font-black text-white/90">Activity</div>
                  <div className="mt-1 text-xs text-white/45">liquidity, volume, utility</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Key idea
              </p>
              <blockquote className="mt-4 text-xl font-bold leading-snug">
                Coincarnation accepts value across the entire spectrum of economic activity.
              </blockquote>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                Healthy assets, Walking Deadcoins, Deadcoins, and Community Deadcoins
                may all be recognized differently depending on what they contribute
                to the ecosystem.
              </p>
            </div>
          </div>

          {/* Core table */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Core matrix
              </p>
              <h3 className="mt-1 text-lg font-semibold">Classification, treasury eligibility, and reward logic</h3>
            </div>

            <div className="overflow-x-auto">
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
          </div>

          {/* Treasury decision */}
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Treasury decision flow
              </p>
              <h3 className="mt-1 text-lg font-semibold">Not every asset becomes a treasury reserve</h3>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Healthy", "Treasury candidate", "May be retained, allocated, or converted."],
                ["Walking Deadcoin", "Case-by-case", "May be retained or converted into stronger reserves."],
                ["Deadcoin", "Recognition only", "No treasury value. CP recognition only."],
                ["Community Deadcoin", "Recognition only", "Community-classified and CP-recognized."],
              ].map(([title, label, desc]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-sm font-bold">{title}</div>
                  <div className="mt-2 text-xs font-semibold text-cyan-100/80">{label}</div>
                  <p className="mt-3 text-xs leading-relaxed text-white/60">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance layer */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Classification layer
              </p>
              <div className="mt-4 space-y-2 text-sm">
                {["Healthy", "Walking Deadcoin", "Deadcoin", "Community Deadcoin"].map((x) => (
                  <div key={x} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    {x}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/70">
                Compliance layer
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="rounded-xl border border-red-300/20 bg-black/20 px-4 py-3">
                  <span className="font-semibold">Redlist</span>
                  <span className="ml-2 text-white/55">Future Coincarnation restricted</span>
                </div>
                <div className="rounded-xl border border-red-300/20 bg-black/20 px-4 py-3">
                  <span className="font-semibold">Blacklist</span>
                  <span className="ml-2 text-white/55">Recognition reversal possible</span>
                </div>
              </div>
            </div>
          </div>

          {/* Final quote */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Accountability principle
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              Recognition without accountability creates incentives for abuse.
            </blockquote>
            <p className="mt-4 text-sm text-white/65">
              The classification framework is designed to support recognition while
              protecting the ecosystem against manipulation, abuse, and low-quality
              participation.
            </p>
          </div>
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