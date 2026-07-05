// app/essays/content/a-question-worth-asking/Essay.tsx

import BookQuote from "@/components/docs/BookQuote";

export default function Essay() {
  return (
    <div className="space-y-10">
      <div className="space-y-7 text-base leading-9 text-white/80">
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
    </div>
  );
}