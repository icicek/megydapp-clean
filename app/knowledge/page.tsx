//app/knowledge/page.tsx

import Link from "next/link";

const sections = [
  {
    title: "Coincarnation Whitepaper",
    subtitle: "The Protocol",
    description:
      "Explore the architecture, tokenomics, governance, Proof Ledger, PVC, MEGY, and the complete technical design of Coincarnation.",
    href: "/docs",
    action: "Read Whitepaper",
  },
  {
    title: "Levershare Essays",
    subtitle: "The Philosophy",
    description:
      "A living collection of essays exploring human potential, economic participation, contribution, and the philosophical foundations of Levershare.",
    href: "/essays",
    action: "Explore Essays",
  },
  {
    title: "Levershare Lexicon",
    subtitle: "The Language",
    description:
      "Definitions of the concepts, terminology, and vocabulary used throughout Levershare and Coincarnation.",
    href: "/lexicon",
    action: "Browse Lexicon",
  },
];

export default function KnowledgePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-20">

      <section className="max-w-3xl">

        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70 font-semibold">
          KNOWLEDGE
        </p>

        <h1 className="mt-5 text-5xl font-black leading-tight text-white">
          Everything you need to understand Levershare.
        </h1>

        <p className="mt-6 text-lg leading-relaxed text-white/65">
          Explore the protocol, the philosophy, and the language behind
          Levershare through an evolving collection of technical documents,
          essays, and reference materials.
        </p>

      </section>

      <section className="mt-16 grid gap-6">

        {sections.map((item) => (

          <Link
            key={item.title}
            href={item.href}
            className="group rounded-3xl border border-white/10 bg-white/[0.03] p-8 transition-all hover:border-cyan-300/30 hover:bg-white/[0.05]"
          >

            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/60 font-semibold">
              {item.subtitle}
            </p>

            <h2 className="mt-4 text-3xl font-black">
              {item.title}
            </h2>

            <p className="mt-5 max-w-3xl text-white/60 leading-relaxed">
              {item.description}
            </p>

            <div className="mt-8 flex items-center gap-2 text-cyan-300 font-semibold group-hover:gap-3 transition-all">
              {item.action}
              <span>→</span>
            </div>

          </Link>

        ))}

      </section>

    </main>
  );
}