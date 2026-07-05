import BookQuote from "@/components/docs/BookQuote";

export default function AQuestionWorthAsking() {
  return (
    <article className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
        Essay No. 01 of ∞ · Part I — Foundations
      </p>

      <h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">
        A Question Worth Asking
      </h1>

      <div className="mt-10 space-y-6 text-base leading-8 text-white/70">
        <p>
          Humanity has spent thousands of years improving the way value moves
          through society.
        </p>

        <p>
          Markets expanded. Money evolved. Institutions emerged. Technology
          accelerated exchange.
        </p>

        <p>
          Every generation inherited these systems and found new ways to improve
          them.
        </p>
      </div>

      <BookQuote>
        How closely can measurable human contribution and economic outcomes be
        aligned?
      </BookQuote>
    </article>
  );
}