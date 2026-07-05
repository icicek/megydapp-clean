//app/essays/config.tsx

import BookQuote from "@/components/docs/BookQuote";

export const ESSAYS = [
  {
    slug: "a-question-worth-asking",
    no: "Essay No. 01 of ∞",
    part: "Part I — Foundations",
    title: "A Question Worth Asking",
    status: "Published",
    updatedAt: "2026-06-30",
    words: 560,
    summary:
      "A foundational introduction to the central question behind Levershare.",
    Content: () => (
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
          Essay No. 01 of ∞ · Part I — Foundations
        </p>

        <h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">
          A Question Worth Asking
        </h1>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-white/70 md:text-base md:leading-8">
          <p>
            Humanity has spent thousands of years improving the way value moves
            through society.
          </p>

          <p>
            Markets expanded. Money evolved. Institutions emerged. Technology
            accelerated exchange. Every generation inherited these systems and
            found new ways to improve them.
          </p>

          <p>
            Yet every generation also inherited the assumptions beneath those
            systems. Some have served humanity remarkably well. Others deserve
            to be questioned.
          </p>
        </div>

        <BookQuote>
          How closely can measurable human contribution and economic outcomes be
          aligned?
        </BookQuote>
      </article>
    ),
  },
];