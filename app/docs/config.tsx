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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Executive Summary
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Coincarnation is a capital formation framework for broader economic participation.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Coincarnation transforms eligible digital assets into productive
                capital, recognizes contribution through Proof of Value, and connects
                that recognition to future opportunity through Personal Value Currency.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Coincarnation was not created to build another token economy.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Core system map */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              System map
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              One framework, four core layers
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Coincarnation", "Creates capital", "Transforms eligible assets into productive capital"],
                ["Fair Future Fund", "Manages and grows it", "Allocates capital through long-term strategies"],
                ["Proof of Value", "Recognizes contribution", "Makes measurable participation visible"],
                ["PVC", "Distributes opportunity", "Connects contribution to future rights and access"],
              ].map(([title, role, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="text-sm font-bold">{title}</div>
                  <div className="mt-2 text-xs font-semibold text-cyan-100/80">
                    {role}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-white/60">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Main thesis */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Core thesis
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Digital Assets", "Existing value"],
                ["Coincarnation", "Capital formation"],
                ["FFF", "Capital growth"],
                ["PoV", "Contribution recognition"],
                ["PVC", "Opportunity distribution"],
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
                Coincarnation creates capital. Fair Future Fund manages and grows it. Proof of Value recognizes contribution. Personal Value Currency distributes opportunity.
              </InsightQuote>
            </div>
          </div>

          {/* What it is / what it is not */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                What Coincarnation is
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "A capital formation framework",
                  "A Proof of Value recognition system",
                  "A pathway from participation to future opportunity",
                  "A long-term economic experiment",
                ].map((x) => (
                  <div
                    key={x}
                    className="rounded-2xl border border-cyan-300/20 bg-black/20 px-4 py-3 text-sm text-white/80"
                  >
                    {x}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/70">
                What Coincarnation is not
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Not a traditional token sale",
                  "Not a promise-based value machine",
                  "Not a claim to solve inequality alone",
                  "Not a short-term product launch",
                ].map((x) => (
                  <div
                    key={x}
                    className="rounded-2xl border border-red-300/20 bg-black/20 px-4 py-3 text-sm text-white/80"
                  >
                    {x}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* MEGY / PVC / FFF quick distinction */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Quick distinction
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                MEGY, PVC, and FFF are different layers
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Layer</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["MEGY", "Ecosystem asset", "Supports ecosystem-wide economic activity"],
                    ["PVC", "Personal value framework", "Represents accumulated recognized contribution"],
                    ["FFF", "Capital management layer", "Preserves, manages, and grows capital"],
                    ["PoV", "Recognition framework", "Defines how contribution becomes visible"],
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

          {/* Final positioning */}
          <div className="rounded-3xl border border-cyan-400/20 bg-black/30 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Positioning
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              The objective is not merely to distribute value, but to enable new
              forms of value creation.
            </blockquote>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Coincarnation begins with digital assets, but its long-term direction
              is broader: capital formation, value recognition, governance
              participation, and opportunity expansion.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-indigo-500/10 to-cyan-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200/80">
                Global Inequality & Capital Formation
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                The problem is not only income. It is access to capital formation.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Many people create value every day, yet remain outside the systems
                that generate long-term capital growth. Coincarnation begins from
                this gap between value creation and capital participation.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Economic opportunity should not be limited by existing capital ownership.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Main problem flow */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Problem flow
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              From inequality to opportunity distribution
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Global Inequality", "Uneven access to opportunity"],
                ["Capital Access Problem", "Capital returns remain concentrated"],
                ["Need for Capital Formation", "Opportunity requires productive capital"],
                ["Coincarnation", "Participation creates capital"],
                ["PVC-Based Distribution", "Recognized contribution guides access"],
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

          {/* Capital access contrast */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Traditional pattern
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-center text-xl font-black">Existing Capital</div>
                <div className="my-3 text-center text-2xl text-white/30">↓</div>
                <div className="text-center text-xl font-black">Investment Access</div>
                <div className="my-3 text-center text-2xl text-white/30">↓</div>
                <div className="text-center text-xl font-black">More Capital</div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-white/60">
                Individuals who already possess productive assets often gain access
                to additional ownership, returns, and long-term appreciation.
              </p>
            </div>

            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Coincarnation approach
              </p>

              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-black/20 p-5">
                <div className="text-center text-xl font-black">Participation</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↓</div>
                <div className="text-center text-xl font-black">Capital Formation</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↓</div>
                <div className="text-center text-xl font-black">Future Opportunity</div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-white/60">
                Coincarnation explores whether participation itself can become a
                pathway toward future economic opportunity.
              </p>
            </div>
          </div>

          {/* Framing table */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Economic framing
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Why capital formation matters
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Economic factor</th>
                    <th className="px-4 py-3 text-left">Common reality</th>
                    <th className="px-4 py-3 text-left">Coincarnation question</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Labor income",
                      "Primary income source for most people",
                      "Can participation create access beyond labor income?",
                    ],
                    [
                      "Capital ownership",
                      "Often concentrated among those already holding assets",
                      "Can capital formation become more broadly accessible?",
                    ],
                    [
                      "Investment returns",
                      "Usually easier to access with existing capital",
                      "Can collectively formed capital support wider opportunity?",
                    ],
                    [
                      "Contribution",
                      "Often economically invisible",
                      "Can measurable contribution become recognized?",
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

          {/* Key distinction */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-purple-400/20 bg-purple-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
                Important distinction
              </p>
              <blockquote className="mt-4 text-xl font-bold leading-snug">
                Coincarnation does not promise equal outcomes. It explores broader
                access to opportunity formation.
              </blockquote>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                The objective is not to erase differences between individuals, but
                to create additional pathways for participation, contribution, and
                capital access.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                What the project asks
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Can dormant and active digital assets support capital formation?",
                  "Can participation become economically visible?",
                  "Can recognized contribution guide future opportunity access?",
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
          </div>

          {/* Full ecosystem flow */}
          <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              System thesis
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["Capital Access Problem", "The starting challenge"],
                ["Coincarnation", "The capital formation mechanism"],
                ["Fair Future Fund", "The capital management layer"],
                ["Global Capital Returns", "The growth source"],
                ["Proof of Value", "The contribution recognition layer"],
                ["PVC", "The opportunity distribution framework"],
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
                Participation can become a pathway toward capital formation.
              </InsightQuote>
            </div>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 via-indigo-500/10 to-cyan-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-200/80">
                Community Classification & Governance
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                The community helps shape how economic reality is recognized.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Coincarnation governance is designed to let the community participate
                in classification rules, asset status decisions, Proof of Value
                evolution, and future PVC usage areas.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Communities should not merely follow economic systems. They should help shape them.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Governance flow */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Governance flow
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              From community input to ecosystem evolution
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Community", "Participants provide input"],
                ["Classification Rules", "Metrics and thresholds evolve"],
                ["Asset Status", "Assets may be reclassified"],
                ["Recognition", "PoV and CP outcomes follow rules"],
                ["Governance Evolution", "The system adapts over time"],
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

          {/* Dynamic classification */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Dynamic classification
              </p>

              <blockquote className="mt-4 text-xl font-bold leading-snug">
                Classification reflects economic reality as it evolves.
              </blockquote>

              <p className="mt-4 text-sm leading-relaxed text-white/65">
                A Community Deadcoin status is not necessarily permanent. If a
                status is created through community voting, it can also be reversed
                through the same community decision path.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Classification reflects economic reality as it evolves.
                </InsightQuote>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Reclassification path
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-center text-xl font-black">Healthy</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↕</div>
                <div className="text-center text-xl font-black">Walking Deadcoin</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↕</div>
                <div className="text-center text-xl font-black">Community Deadcoin</div>
              </div>
            </div>
          </div>

          {/* Classification metrics */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Classification metrics
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                The community helps define the boundaries
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Governance Area</th>
                    <th className="px-4 py-3 text-left">Community Role</th>
                    <th className="px-4 py-3 text-left">Why It Matters</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Liquidity Thresholds",
                      "Define / update",
                      "Separates active assets from weak market structures",
                    ],
                    [
                      "Volume Thresholds",
                      "Define / update",
                      "Helps distinguish activity from inactivity",
                    ],
                    [
                      "Community Deadcoin Status",
                      "Vote",
                      "Allows the ecosystem to classify economically inactive assets",
                    ],
                    [
                      "Reclassification",
                      "Vote",
                      "Allows status reversal when economic conditions change",
                    ],
                    [
                      "Classification Framework Updates",
                      "Participate",
                      "Keeps classification aligned with market reality",
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

          {/* Governance authority table */}
          <div className="overflow-hidden rounded-3xl border border-purple-400/20 bg-purple-400/5">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
                Decision authority
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Different decisions require different authority layers
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Topic</th>
                    <th className="px-4 py-3 text-left">Decision Authority</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Community Deadcoin Status", "Community"],
                    ["Classification Metrics", "Community"],
                    ["PoV Categories", "Governance"],
                    ["PVC Usage Areas", "Governance"],
                    ["Blacklist Recommendation", "Community"],
                    ["Blacklist Enforcement", "Administration"],
                    ["FFF Investments", "Fund Management"],
                  ].map(([a, b]) => (
                    <tr key={a} className="border-t border-white/10">
                      <td className="px-4 py-3 font-semibold">{a}</td>
                      <td className="px-4 py-3 text-white/70">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PVC representation model */}
          <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Representation model
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              One participant, one base voice — plus recognized contribution weight
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Identity", "The participant is recognized beyond isolated wallets"],
                ["Base Vote", "Every participant has a voice"],
                ["PVC Weight", "Recognized contribution may increase representation"],
                ["Governance Influence", "Voice and contribution combine"],
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
                Every participant has a voice. Recognized contribution increases representation.
              </InsightQuote>
            </div>
          </div>

          {/* Blacklist process */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/70">
                Blacklist process
              </p>

              <div className="mt-4 rounded-2xl border border-red-300/20 bg-black/20 p-5">
                <div className="text-center text-xl font-black">Community</div>
                <div className="my-3 text-center text-2xl text-red-200/50">↓</div>
                <div className="text-center text-xl font-black">Recommendation</div>
                <div className="my-3 text-center text-2xl text-red-200/50">↓</div>
                <div className="text-center text-xl font-black">Administrative Review</div>
                <div className="my-3 text-center text-2xl text-red-200/50">↓</div>
                <div className="text-center text-xl font-black">Blacklist Decision</div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Why blacklist is different
              </p>

              <p className="mt-4 text-sm leading-relaxed text-white/65">
                Blacklisting is intentionally separated from ordinary governance
                because it may affect past recognition, future participation, and
                potential reversal logic.
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Ordinary classification can be community-driven.",
                  "Blacklist can be community-recommended.",
                  "Final blacklist enforcement remains administrative.",
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
          </div>

          {/* Final quote */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Governance principle
            </p>

            <blockquote className="mt-3 text-2xl font-black leading-tight">
              Coincarnation is not designed to create a community around a protocol.
              It is designed to allow the community to participate in shaping the protocol itself.
            </blockquote>

            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Governance begins with classification, but its long-term scope may
              expand into Proof of Value categories, PVC usage areas, and future
              ecosystem rules.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Identity Layer
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Coincarnation recognizes people, not isolated wallet addresses.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Wallets remain essential in Web3, but long-term contribution,
                governance, CorePoints, and PVC require a persistent identity context.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Coincarnation is designed to recognize people rather than wallet addresses.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Identity flow */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Identity flow
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              From multiple wallets to one participation record
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Identity", "The participant context"],
                ["Multiple Wallets", "Different connected addresses"],
                ["Unified Record", "Participation is aggregated"],
                ["CorePoints", "Contribution is accounted"],
                ["PVC", "Recognized contribution accumulates"],
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

          {/* Traditional Web3 vs Coincarnation */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Design shift
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                From wallet-centric to identity-centric participation
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Traditional Web3</th>
                    <th className="px-4 py-3 text-left">Coincarnation</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Wallet-Centric", "Identity-Centric"],
                    ["Isolated Addresses", "Unified Participation"],
                    ["Fragmented Reputation", "Persistent Reputation"],
                    ["Wallet-Based Rewards", "Identity-Based Recognition"],
                    ["Easy Multi-Wallet Farming", "Identity-Level Abuse Resistance"],
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

          {/* Why it matters */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Key idea
              </p>

              <blockquote className="mt-4 text-xl font-bold leading-snug">
                Identity does not replace wallets. It gives participation a persistent context.
              </blockquote>

              <p className="mt-4 text-sm leading-relaxed text-white/65">
                The identity layer allows contribution, referral activity, deadcoin
                recognition, CorePoints, and future governance participation to be
                understood across connected wallets.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Identity does not replace wallets. It gives participation a persistent context.
                </InsightQuote>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Abuse resistance
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-center text-xl font-black">Multiple Wallets</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↓</div>
                <div className="text-center text-xl font-black">Same Identity</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↓</div>
                <div className="text-center text-xl font-black">Unified Limits</div>
                <div className="my-3 text-center text-2xl text-cyan-200/50">↓</div>
                <div className="text-center text-xl font-black">Fair Recognition</div>
              </div>
            </div>
          </div>

          {/* Support matrix */}
          <div className="overflow-hidden rounded-3xl border border-purple-400/20 bg-purple-400/5">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
                Identity supports
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Why identity matters across the ecosystem
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Layer</th>
                    <th className="px-4 py-3 text-left">Why It Matters</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "CorePoint Accounting",
                      "Contributions accumulate under one identity rather than scattered wallets.",
                    ],
                    [
                      "PVC Formation",
                      "PVC reflects recognized participation over time.",
                    ],
                    [
                      "Referral Integrity",
                      "Referral rewards can be evaluated at the identity level.",
                    ],
                    [
                      "Deadcoin Bonus Control",
                      "One identity cannot repeatedly claim the same recognition for the same asset.",
                    ],
                    [
                      "Governance Participation",
                      "Future voting can combine base identity and PVC-based weight.",
                    ],
                  ].map(([a, b]) => (
                    <tr key={a} className="border-t border-white/10">
                      <td className="px-4 py-3 font-semibold">{a}</td>
                      <td className="px-4 py-3 text-white/70">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Identity architecture */}
          <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Architecture principle
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Wallets", "Execution layer"],
                ["Identity", "Participation layer"],
                ["Proof of Value", "Recognition layer"],
                ["PVC", "Economic identity layer"],
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
                Fair contribution recognition requires more than isolated wallet addresses.
              </InsightQuote>
            </div>
          </div>

          {/* Final */}
          <div className="rounded-3xl border border-cyan-400/20 bg-black/30 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Final idea
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              A durable contribution system needs a durable participant context.
            </blockquote>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              By connecting multiple wallets to a persistent identity layer,
              Coincarnation creates a foundation for fairer recognition, stronger
              abuse resistance, and long-term PVC formation.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Proof Ledger
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Recognition should be visible, traceable, and accountable.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Proof Ledger records recognized contributions and their impact on
                CorePoints. It provides transparency, auditability, and the ability
                to correct or reverse recognition when necessary.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Recognition should be visible, traceable, and reversible when necessary.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Ledger Flow */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Recognition flow
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              From contribution to opportunity
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Contribution", "An eligible activity occurs"],
                ["Proof Ledger Entry", "Activity is recorded"],
                ["CorePoints", "Recognition is quantified"],
                ["PVC", "Contribution accumulates"],
                ["Opportunity", "Participation may unlock future access"],
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

          {/* What gets recorded */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Ledger events
              </p>

              <h3 className="mt-1 text-lg font-semibold">
                Activities that may affect CorePoints
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Activity</th>
                    <th className="px-4 py-3 text-left">Ledger Effect</th>
                  </tr>
                </thead>

                <tbody>
                  {[
                    ["Coincarnation", "CP Added"],
                    ["Referral", "CP Added"],
                    ["Sharing Activity", "CP Added"],
                    ["Deadcoin Recognition", "CP Added"],
                    ["Blacklisted Contribution", "CP Reversed"],
                    ["Confirmed Manipulation", "CP Removed"],
                  ].map(([a, b]) => (
                    <tr key={a} className="border-t border-white/10">
                      <td className="px-4 py-3 font-semibold">{a}</td>
                      <td className="px-4 py-3 text-white/70">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Accountability Layer */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Accountability layer
              </p>

              <blockquote className="mt-4 text-xl font-bold leading-snug">
                Recognition without accountability eventually loses credibility.
              </blockquote>

              <p className="mt-4 text-sm leading-relaxed text-white/65">
                Proof Ledger is not only a record of earned recognition. It is also
                a framework for maintaining integrity across the ecosystem.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Recognition + Transparency + Reversal Logic = Proof Ledger
                </InsightQuote>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Integrity process
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-center text-xl font-black">
                  Valid Contribution
                </div>

                <div className="my-3 text-center text-2xl text-cyan-200/50">
                  ↓
                </div>

                <div className="text-center text-xl font-black">Recorded</div>

                <div className="my-3 text-center text-2xl text-white/20">
                  ···
                </div>

                <div className="text-center text-xl font-black">
                  Invalid Activity
                </div>

                <div className="my-3 text-center text-2xl text-red-200/50">
                  ↓
                </div>

                <div className="text-center text-xl font-black">Reviewed</div>

                <div className="my-3 text-center text-2xl text-red-200/50">
                  ↓
                </div>

                <div className="text-center text-xl font-black">
                  Adjusted or Reversed
                </div>
              </div>
            </div>
          </div>

          {/* Why it matters */}
          <div className="overflow-hidden rounded-3xl border border-purple-400/20 bg-purple-400/5">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
                Why it matters
              </p>

              <h3 className="mt-1 text-lg font-semibold">
                Trust requires an auditable recognition history
              </h3>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-3">
              {[
                [
                  "Transparency",
                  "Participants can understand how recognition was created.",
                ],
                [
                  "Auditability",
                  "Recognition events remain visible and reviewable.",
                ],
                [
                  "Correction",
                  "Improper recognition can be adjusted when necessary.",
                ],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-sm font-bold">{title}</div>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Final */}
          <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Trust principle
            </p>

            <blockquote className="mt-3 text-2xl font-black leading-tight">
              Proof Ledger protects both recognition and trust.
            </blockquote>

            <p className="mt-4 text-sm leading-relaxed text-white/65">
              The purpose of the ledger is not merely to track activity. Its purpose
              is to ensure that recognized contribution remains transparent,
              reviewable, and credible over time.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Proof of Value Framework
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Proof of Value recognizes contribution, not human worth.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Proof of Value defines how measurable participation becomes recognized
                contribution inside Coincarnation. It connects Proof Ledger entries,
                CorePoints, PVC, and future economic participation into one accountable
                recognition framework.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Proof of Value does not attempt to measure the total worth of a human being. It attempts to recognize measurable forms of contribution.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Core distinction */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [
                "Human worth",
                "Not measured",
                "PoV does not rank people, lives, identity, dignity, or personal value.",
              ],
              [
                "Contribution",
                "Recognized",
                "PoV recognizes actions that can be observed, verified, and recorded.",
              ],
              [
                "Accountability",
                "Required",
                "Recognition must remain reviewable, reversible, and protected from abuse.",
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

          {/* Comparison table */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Proof systems
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                What different proof models recognize
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Proof Model</th>
                    <th className="px-4 py-3 text-left">Recognizes</th>
                    <th className="px-4 py-3 text-left">Primary Logic</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Proof of Work", "Computation", "Energy and hardware secure the network"],
                    ["Proof of Stake", "Capital", "Token ownership secures participation"],
                    ["Proof of Authority", "Authority", "Trusted actors validate the system"],
                    ["Proof of History", "Time", "Cryptographic ordering creates coordination"],
                    ["Proof of Liquidity", "Liquidity", "Market depth supports economic access"],
                    ["Proof of Value", "Contribution", "Verified participation becomes recognized value"],
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

          {/* Flow */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Recognition flow
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              From measurable action to economic participation
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Contribution", "An eligible action occurs"],
                ["Proof Ledger", "The action is recorded"],
                ["CorePoints", "Recognition is quantified"],
                ["PVC", "Contribution accumulates"],
                ["Economic Participation", "Future access may emerge"],
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
          </div>

          {/* Evolution */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [
                "Phase 1",
                "Initial recognition",
                "Coincarnation, referrals, sharing activity, and deadcoin recognition create the first measurable contribution signals.",
              ],
              [
                "Phase 2",
                "Expanded participation",
                "PoV may evolve through additional verified contribution categories and refined recognition rules.",
              ],
              [
                "Future",
                "Broader value layer",
                "As measurement improves, PVC may become a stronger foundation for access, governance, and opportunity.",
              ],
            ].map(([phase, title, desc]) => (
              <div
                key={phase}
                className="rounded-3xl border border-white/10 bg-black/30 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                  {phase}
                </p>
                <h3 className="mt-3 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{desc}</p>
              </div>
            ))}
          </div>

          {/* Final */}
          <div className="rounded-3xl border border-cyan-400/20 bg-black/30 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Accountability principle
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              Recognition within Proof of Value is earned, not guaranteed.
            </blockquote>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Proof of Value only works if recognition remains credible. Contributions
              may be recorded, reviewed, corrected, or reversed when the underlying
              activity no longer satisfies the rules of the ecosystem.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 via-indigo-500/10 to-cyan-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-200/80">
                Personal Value Currency
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                PVC is accumulated recognized contribution.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Personal Value Currency represents the contribution history recognized
                through Proof of Value. It is not a replacement for money, not a market
                token, and not a measure of human worth. It is a personal economic layer
                built from verified participation.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  PVC does not define who a person is. It records what the ecosystem has recognized.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Definition cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [
                "Accumulation",
                "PVC grows through recognized contribution recorded by the Proof Ledger.",
              ],
              [
                "Identity",
                "PVC belongs to an economic identity rather than a single wallet address.",
              ],
              [
                "Opportunity",
                "PVC may support future access, governance, benefits, and economic rights.",
              ],
            ].map(([title, desc]) => (
              <div
                key={title}
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                  PVC Layer
                </p>
                <h3 className="mt-3 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{desc}</p>
              </div>
            ))}
          </div>

          {/* PVC flow */}
          <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              PVC formation flow
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              From contribution recognition to personal value history
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Action", "A participant contributes"],
                ["Proof Ledger", "Contribution is recorded"],
                ["CorePoints", "Recognition is quantified"],
                ["PVC", "Recognized value accumulates"],
                ["Future Access", "Opportunity may expand"],
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
          </div>

          {/* What PVC is / is not */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                What PVC is
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "A record of accumulated recognized contribution",
                  "A personal value history inside the ecosystem",
                  "A possible basis for future rights and access",
                  "A bridge between contribution and opportunity",
                ].map((x) => (
                  <div
                    key={x}
                    className="rounded-2xl border border-cyan-300/20 bg-black/20 px-4 py-3 text-sm text-white/80"
                  >
                    {x}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/70">
                What PVC is not
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Not a measurement of human worth",
                  "Not a traditional currency",
                  "Not a guaranteed claim on future returns",
                  "Not a substitute for accountability",
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

          {/* PVC utility table */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Potential utility
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                What PVC may support over time
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Area</th>
                    <th className="px-4 py-3 text-left">Possible Role</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Governance", "Contribution-weighted participation", "Future design area"],
                    ["Opportunity Access", "Eligibility signal for ecosystem benefits", "Future design area"],
                    ["Reputation", "Visible history of recognized contribution", "Core concept"],
                    ["Economic Rights", "Potential basis for future distribution logic", "Subject to governance"],
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

          {/* PVC vs MEGY */}
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Important distinction
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              PVC and MEGY are complementary layers
            </h3>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-purple-400/20 bg-purple-400/10 p-5">
                <div className="text-sm font-bold text-purple-100">PVC</div>
                <p className="mt-3 text-sm leading-relaxed text-white/65">
                  Personal Value Currency reflects accumulated recognized contribution.
                  It is personal, identity-based, and contribution-oriented.
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-5">
                <div className="text-sm font-bold text-cyan-100">MEGY</div>
                <p className="mt-3 text-sm leading-relaxed text-white/65">
                  MEGY is the ecosystem asset that supports broader economic activity,
                  exchange, incentives, and participation across the network.
                </p>
              </div>
            </div>
          </div>

          {/* Final principle */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Core principle
            </p>
            <blockquote className="mt-3 text-2xl font-black leading-tight">
              PVC turns recognized contribution into a durable personal value history.
            </blockquote>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              The long-term purpose of PVC is to help the ecosystem remember who
              contributed, how contribution was recognized, and how that recognition may
              connect to future opportunity.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-purple-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Future PVC Sources
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                Proof of Value can evolve as new forms of contribution become measurable.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Coincarnation does not assume that value originates from a single source.
                Future PVC sources may expand beyond initial Coincarnation activity as
                new forms of contribution become verifiable, accountable, and useful to
                the ecosystem.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  The future may recognize more forms of value than the present.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Source categories */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [
                "Current Sources",
                "Already measurable",
                "Coincarnation activity, referrals, sharing, and recognized deadcoin contribution.",
              ],
              [
                "Emerging Sources",
                "Under design",
                "Useful ecosystem actions that can be verified without creating abuse incentives.",
              ],
              [
                "Future Sources",
                "Governance-dependent",
                "New contribution categories that may be added through community and protocol evolution.",
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

          {/* Evolution flow */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Expansion logic
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              A contribution type should mature before becoming a PVC source
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["Observed Action", "A useful behavior appears"],
                ["Measurement", "The action becomes measurable"],
                ["Verification", "Abuse resistance is tested"],
                ["Recognition", "PoV rules define value"],
                ["PVC Source", "Contribution may accumulate"],
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
          </div>

          {/* Future source matrix */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Future source matrix
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Possible future contribution categories
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-left">What it may recognize</th>
                    <th className="px-4 py-3 text-left">Requirement</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Ecosystem Building",
                      "Useful actions that expand adoption, education, or participation",
                      "Measurable impact",
                    ],
                    [
                      "Governance Participation",
                      "Constructive voting, review, and protocol improvement activity",
                      "Identity-based accountability",
                    ],
                    [
                      "Knowledge Contribution",
                      "Documentation, analysis, research, or educational contribution",
                      "Quality validation",
                    ],
                    [
                      "Community Support",
                      "Helping users understand, participate, and avoid harmful behavior",
                      "Abuse-resistant tracking",
                    ],
                    [
                      "Capital Stewardship",
                      "Actions that support long-term ecosystem sustainability",
                      "Transparent verification",
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

          {/* Guardrails */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Expansion principle
              </p>

              <blockquote className="mt-4 text-xl font-bold leading-snug">
                A new PVC source should be useful, measurable, verifiable, and aligned
                with long-term ecosystem value.
              </blockquote>

              <p className="mt-4 text-sm leading-relaxed text-white/65">
                The goal is not to reward every action. The goal is to recognize
                contribution types that strengthen the ecosystem without weakening trust.
              </p>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/70">
                What should not become a PVC source
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Pure noise or spam",
                  "Unverified claims of contribution",
                  "Manipulated activity loops",
                  "Actions that create short-term metrics but long-term harm",
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

          {/* Governance note */}
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Governance dependency
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              Future PVC sources should not be added casually.
            </h3>

            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Each new source changes the meaning of PVC. For that reason, future
              categories should pass through protocol review, abuse testing, community
              discussion, and governance approval before becoming part of the official
              Proof of Value framework.
            </p>

            <div className="mt-5">
              <InsightQuote>
                Expanding recognition also expands responsibility.
              </InsightQuote>
            </div>
          </div>

          {/* Final principle */}
          <div className="rounded-3xl border border-cyan-400/20 bg-black/30 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Future principle
            </p>

            <blockquote className="mt-3 text-2xl font-black leading-tight">
              PVC should evolve carefully, because what a system recognizes will shape
              what people are incentivized to do.
            </blockquote>

            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Future PVC sources are therefore not merely feature additions. They are
              incentive design decisions that determine which forms of contribution the
              ecosystem chooses to remember.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 via-indigo-500/10 to-cyan-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-purple-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative">
              <img
                src="/megy-symbol.png"
                alt="MEGY"
                className="absolute right-0 top-0 h-20 w-20 opacity-20 md:h-24 md:w-24"
              />

              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-200/80">
                MEGY
              </p>

              <h3 className="mt-3 max-w-3xl text-2xl font-bold leading-tight md:text-3xl">
                MEGY is the economic asset of the Coincarnation ecosystem.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                MEGY powers participation, incentives, liquidity, and long-term
                economic activity across Coincarnation. While PVC records recognized
                contribution, MEGY enables economic interaction.
              </p>

              <div className="mt-5 max-w-2xl">
                <InsightQuote>
                  PVC remembers contribution. MEGY powers the economy around it.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Two-layer distinction */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                Two-layer economy
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                PVC and MEGY serve different roles
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left">Layer</th>
                    <th className="px-4 py-3 text-left">PVC</th>
                    <th className="px-4 py-3 text-left">MEGY</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Purpose", "Records recognized contribution", "Enables economic activity"],
                    ["Nature", "Identity-based", "Ecosystem-based"],
                    ["Transferability", "Non-transferable", "Transferable"],
                    ["Role", "Recognition layer", "Economic layer"],
                    ["Focus", "Personal value history", "Ecosystem utility"],
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

          {/* Flow */}
          <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Economic flow
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              From contribution to ecosystem activity
            </h3>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Contribution", "A participant creates measurable value"],
                ["Proof of Value", "The contribution is recognized"],
                ["PVC", "Recognized value accumulates"],
                ["Economic Participation", "Future access may emerge"],
                ["MEGY Economy", "Economic activity is enabled"],
              ].map(([title, subtitle]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-sm font-bold">{title}</div>
                  <div className="mt-2 text-xs leading-relaxed text-white/55">
                    {subtitle}
                  </div>
                </div>
              ))}
            </div>

            <blockquote className="mt-5 rounded-2xl border-l-4 border-cyan-300 bg-white/[0.04] p-5 text-lg font-semibold">
              PVC determines where recognized contribution exists. MEGY enables what
              can happen around it.
            </blockquote>
          </div>

          {/* What MEGY is / is not */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                What MEGY is
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "The ecosystem asset of Coincarnation",
                  "A medium for economic activity and incentives",
                  "A liquidity and participation layer",
                  "A long-term coordination tool for the ecosystem",
                ].map((x) => (
                  <div
                    key={x}
                    className="rounded-2xl border border-cyan-300/20 bg-black/20 px-4 py-3 text-sm text-white/80"
                  >
                    {x}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/70">
                What MEGY is not
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Not a fundraising token",
                  "Not a speculative promise",
                  "Not a shortcut to PVC",
                  "Not the entire Coincarnation ecosystem",
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

          {/* Core functions */}
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Core functions
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              What MEGY enables inside the ecosystem
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["Incentives", "Rewards and motivates useful participation."],
                ["Liquidity", "Supports trading, depth, and economic circulation."],
                ["Governance", "May support future coordination and ecosystem decisions."],
                ["Access", "Powers participation mechanisms and opportunity design."],
                ["Alignment", "Connects long-term stakeholders around shared goals."],
                ["Sustainability", "Supports long-term ecosystem growth and health."],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="text-sm font-bold">{title}</div>
                  <p className="mt-3 text-xs leading-relaxed text-white/60">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Why both exist */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Why PVC and MEGY both exist
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              An economy needs memory and movement.
            </h3>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                [
                  "Without PVC",
                  "Money dominates recognition. The system forgets who truly contributes.",
                ],
                [
                  "Without MEGY",
                  "Recognition lacks economic activity. Value cannot move, circulate, or grow.",
                ],
                [
                  "With both",
                  "Contribution is remembered, economic activity is enabled, and the ecosystem can mature.",
                ],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="text-sm font-bold text-cyan-100">{title}</div>
                  <p className="mt-3 text-sm leading-relaxed text-white/65">{desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <InsightQuote>
                An economy needs more than money. It also needs memory.
              </InsightQuote>
            </div>
          </div>

          {/* Final positioning */}
          <div className="rounded-3xl border border-cyan-400/20 bg-black/30 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
              Long-term positioning
            </p>

            <div className="mt-4 flex items-start gap-4">
              <img
                src="/megy-symbol.png"
                alt="MEGY"
                className="mt-1 h-10 w-10 shrink-0 opacity-80"
              />

              <blockquote className="text-2xl font-black leading-tight">
                MEGY creates the economic field.
                <br />
                PVC reflects your place within it.
              </blockquote>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-white/65">
              MEGY is not designed to be the destination. It is designed to be the
              economic asset that helps the broader Coincarnation ecosystem function,
              circulate, coordinate, and grow over time.
            </p>
          </div>
        </section>
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
        <section className="space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-cyan-500/10 p-6">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200/80">
                Tokenomics
              </p>

              <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
                MEGY tokenomics is designed around participation, sustainability, and long-term ecosystem growth.
              </h3>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                Tokenomics defines how MEGY enters circulation, supports incentives,
                enables liquidity, aligns participants, and protects the long-term
                economic health of Coincarnation.
              </p>

              <div className="mt-5">
                <InsightQuote>
                  Tokenomics is not only about supply. It is about economic behavior.
                </InsightQuote>
              </div>
            </div>
          </div>

          {/* Tokenomics engine */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Economic engine
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              MEGY moves through a participation-driven system
            </h3>

            <div className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
              <div className="relative mx-auto flex h-64 w-64 items-center justify-center rounded-full border border-amber-300/20 bg-black/30">
                <div className="absolute inset-4 rounded-full border border-purple-300/20" />
                <div className="absolute inset-10 rounded-full border border-cyan-300/20" />
                <div className="absolute h-28 w-28 rounded-full bg-gradient-to-br from-amber-400/25 to-purple-400/20 blur-xl" />

                <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-amber-300/30 bg-black/60 text-center shadow-[0_0_50px_rgba(251,191,36,0.18)]">
                  <div>
                    <div className="text-2xl font-black text-amber-100">MEGY</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                      Economy
                    </div>
                  </div>
                </div>

                {[
                  ["Incentives", "top-2 left-1/2 -translate-x-1/2"],
                  ["Liquidity", "right-0 top-1/2 -translate-y-1/2"],
                  ["Access", "bottom-2 left-1/2 -translate-x-1/2"],
                  ["Governance", "left-0 top-1/2 -translate-y-1/2"],
                ].map(([label, pos]) => (
                  <div
                    key={label}
                    className={`absolute ${pos} rounded-full border border-white/10 bg-black/60 px-3 py-2 text-[11px] font-semibold text-white/70`}
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "Participation",
                    "MEGY enters the ecosystem through contribution, activity, and protocol-defined participation mechanisms.",
                  ],
                  [
                    "Circulation",
                    "MEGY supports economic movement across incentives, liquidity, access, and future utility areas.",
                  ],
                  [
                    "Alignment",
                    "The model should reward long-term ecosystem contribution rather than short-term extraction.",
                  ],
                  [
                    "Sustainability",
                    "Emission, incentives, and allocation should evolve with ecosystem health and governance.",
                  ],
                ].map(([title, desc]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white/10 bg-black/25 p-4"
                  >
                    <div className="text-sm font-bold">{title}</div>
                    <p className="mt-3 text-xs leading-relaxed text-white/60">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Total supply distribution */}
          <div className="rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-black/30 to-purple-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/70">
              Total supply distribution
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              The majority of MEGY supply is reserved for Coincarnation participants.
            </h3>

            <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div className="mx-auto flex flex-col items-center">
                <div
                  className="relative flex h-56 w-56 items-center justify-center rounded-full shadow-[0_0_70px_rgba(251,191,36,0.16)] sm:h-64 sm:w-64 lg:h-72 lg:w-72"
                  style={{
                    background:
                      "conic-gradient(#fbbf24 0deg 270deg, #a855f7 270deg 306deg, #22d3ee 306deg 324deg, #2dd4bf 324deg 342deg, #fb923c 342deg 360deg)",
                  }}
                >
                  <div className="absolute inset-3 rounded-full border border-white/10" />
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-zinc-950 text-center sm:h-32 sm:w-32 lg:h-36 lg:w-36">
                    <div>
                      <div className="text-3xl font-black text-white sm:text-4xl">8B</div>
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        Total MEGY
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-amber-300/20 bg-black/25 px-4 py-3 text-center">
                  <div className="text-2xl font-black text-amber-100">75%</div>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">
                    Reserved for Coincarnation Rewards
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                {[
                  [
                    "Coincarnation Rewards",
                    "75%",
                    "The primary allocation for participants who enter through Coincarnation and recognized ecosystem participation.",
                    "#fbbf24",
                  ],
                  [
                    "Partnerships & Ecosystem Growth",
                    "10%",
                    "Reserved for integrations, ecosystem expansion, adoption initiatives, and strategic growth.",
                    "#a855f7",
                  ],
                  [
                    "Fair Future Fund Reserve",
                    "5%",
                    "A reserve layer connected to long-term capital formation, resilience, and future opportunity design.",
                    "#22d3ee",
                  ],
                  [
                    "Liquidity",
                    "5%",
                    "Supports market depth, circulation, and smoother economic movement across the MEGY economy.",
                    "#2dd4bf",
                  ],
                  [
                    "Team & Contributors",
                    "5%",
                    "Reserved for long-term builders and contributors, subject to alignment and vesting logic.",
                    "#fb923c",
                  ],
                ].map(([title, percent, desc, color]) => (
                  <div
                    key={title}
                    className="flex gap-4 rounded-2xl border border-white/10 bg-black/25 p-4"
                  >
                    <div
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-lg font-black text-white">{percent}</span>
                        <span className="text-sm font-bold">{title}</span>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-white/60">
                        {desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <InsightQuote>
                Most token economies reserve the majority of supply for insiders.
                Coincarnation reserves the majority of supply for participants.
              </InsightQuote>
            </div>
          </div>

          {/* Supply logic */}
          <div className="rounded-3xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-100/70">
              Supply logic
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              MEGY supply should support ecosystem maturity, not short-term hype.
            </h3>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                [
                  "Participant-first allocation",
                  "Coincarnation Rewards should never fall below 75% of total supply.",
                ],
                [
                  "Active circulation",
                  "MEGY moves through incentives, liquidity, campaigns, access, and participation.",
                ],
                [
                  "Governance control",
                  "Future changes should be transparent, rule-based, and subject to ecosystem governance.",
                ],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="text-sm font-bold text-cyan-100">{title}</div>
                  <p className="mt-3 text-sm leading-relaxed text-white/65">{desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <InsightQuote>
                A healthy token economy does not only ask how tokens are distributed.
                It asks why they should circulate.
              </InsightQuote>
            </div>
          </div>

          {/* Release model */}
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Release model
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              MEGY should be released through ecosystem logic, not arbitrary pressure.
            </h3>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Phase", "Distribution rules evolve through defined ecosystem phases."],
                ["Participation", "Activity and contribution influence how MEGY enters use."],
                ["Liquidity", "Circulation should be supported without destabilizing the system."],
                ["Governance", "Future adjustments should remain transparent and accountable."],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="text-sm font-bold">{title}</div>
                  <p className="mt-3 text-xs leading-relaxed text-white/60">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tokenomics should create / avoid */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Tokenomics should create
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Useful circulation",
                  "Long-term alignment",
                  "Sustainable incentives",
                  "Transparent economic rules",
                ].map((x) => (
                  <div
                    key={x}
                    className="rounded-2xl border border-cyan-300/20 bg-black/20 px-4 py-3 text-sm text-white/80"
                  >
                    {x}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/70">
                Tokenomics should avoid
              </p>

              <div className="mt-4 space-y-2">
                {[
                  "Unsustainable emissions",
                  "Short-term extraction",
                  "Opaque allocation logic",
                  "Incentives that reward manipulation",
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

          {/* Final */}
          <div className="rounded-3xl border border-amber-400/20 bg-black/30 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/70">
              Tokenomics principle
            </p>

            <blockquote className="mt-3 text-2xl font-black leading-tight">
              MEGY tokenomics should make useful participation more valuable than passive speculation.
            </blockquote>

            <p className="mt-4 text-sm leading-relaxed text-white/65">
              The long-term purpose of MEGY tokenomics is to support an economy where
              incentives, liquidity, access, and governance reinforce the broader
              Coincarnation mission.
            </p>
          </div>
        </section>
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