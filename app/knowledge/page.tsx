// app/knowledge/page.tsx

import Link from "next/link";

const sections = [
  {
    title: "Coincarnation Whitepaper",
    subtitle: "The Protocol",
    description:
      "The technical architecture, economic design, tokenomics, governance, Proof Ledger, PVC, MEGY, and protocol logic behind Coincarnation.",
    href: "/docs",
    action: "Read Whitepaper",
    number: "01",
  },
  {
    title: "Levershare Essays",
    subtitle: "The Philosophy",
    description:
      "A growing essay collection exploring human potential, visibility, contribution, technology, and the philosophical foundations behind Levershare.",
    href: "/essays",
    action: "Explore Essays",
    number: "02",
  },
  {
    title: "Levershare Lexicon",
    subtitle: "The Language",
    description:
      "A living glossary of the core concepts, terms, and definitions used across Coincarnation, Proof of Value, PVC, MEGY, and Levershare.",
    href: "/lexicon",
    action: "Browse Lexicon",
    number: "03",
  },
];

export const metadata = {
  title: "Knowledge — Levershare",
  description:
    "The knowledge hub for the protocol, philosophy, and language of Levershare.",
};

export default function KnowledgePage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-20 text-white md:py-24">
      <section className="mx-auto max-w-6xl">
        <header className="border-b border-white/10 pb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.38em] text-cyan-300/70">
            Knowledge
          </p>

          <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
            Understand the system behind the idea.
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
            Explore the protocol, the philosophy, and the language behind
            Levershare through an evolving knowledge base.
          </p>
        </header>

        <section className="divide-y divide-white/10">
          {sections.map((item) => (
            <Link key={item.title} href={item.href} className="group block">
              <div className="grid gap-6 py-12 transition md:grid-cols-[90px_1fr_180px] md:items-center">
                <div className="text-4xl font-black text-white/20 transition group-hover:text-cyan-200/80">
                  {item.number}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/60">
                    {item.subtitle}
                  </p>

                  <h2 className="mt-4 text-3xl font-black leading-tight transition group-hover:translate-x-1 md:text-5xl">
                    {item.title}
                  </h2>

                  <p className="mt-5 max-w-3xl text-sm leading-relaxed text-white/55 md:text-base">
                    {item.description}
                  </p>
                </div>

                <div className="text-left md:text-right">
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-cyan-200/75 transition group-hover:text-cyan-100">
                    {item.action}
                    <span className="transition group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}