//app/essays/page.tsx

import Link from "next/link";

const essays = [
  {
    no: "Essay No. 01 of ∞",
    part: "Part I — Foundations",
    title: "A Question Worth Asking",
    status: "Published",
    href: "/essays/a-question-worth-asking",
    description:
      "The central question behind Levershare: how closely meaningful human contribution and economic outcomes can be aligned.",
  },
  {
    no: "Essay No. 02 of ∞",
    part: "Part I — Foundations",
    title: "The Cost of Misalignment",
    status: "Published",
    href: "/essays/the-cost-of-misalignment",
    description:
      "Why income inequality may begin long before income is distributed.",
  },
  {
    no: "Essay No. 03 of ∞",
    part: "Part I — Foundations",
    title: "Every Economy Grows What It Chooses to Recognize",
    status: "Published",
    href: "/essays/every-economy-grows-what-it-chooses-to-recognize",
    description:
      "How economies evolve around the forms of human contribution they can recognize, coordinate, and reward.",
  },
  {
    no: "Essay No. 04 of ∞",
    part: "Part I — Foundations",
    title: "When Human Potential Becomes Free",
    status: "Writing",
    href: "#",
    description:
      "An upcoming essay on the conditions under which human potential becomes free to emerge, contribute, and create value.",
  },
];

export const metadata = {
  title: "Essays — Levershare",
  description:
    "A growing collection of essays exploring the philosophical, economic, and technological foundations of Levershare.",
};

export default function EssaysPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-20 text-white">
      <section className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/70">
          Levershare Essays
        </p>

        <h1 className="mt-5 text-5xl font-black leading-tight">
          Essay No. 01 of ∞
        </h1>

        <p className="mt-6 text-lg leading-relaxed text-white/65">
          A growing collection of essays exploring the philosophical, economic,
          and technological foundations of Levershare.
        </p>

        <p className="mt-4 text-sm leading-relaxed text-white/45">
          Essays are published as they are written. They are part of an ongoing
          body of work and may evolve as new ideas emerge.
        </p>
      </section>

      <section className="mt-14 space-y-5">
        {essays.map((essay) => {
          const isDisabled = essay.status !== "Published";

          const CardContent = (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-cyan-300/30 hover:bg-white/[0.05]">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/40">
                <span>{essay.no}</span>
                <span>•</span>
                <span>{essay.part}</span>
                <span>•</span>
                <span
                  className={
                    essay.status === "Published"
                      ? "text-cyan-200/70"
                      : "text-amber-200/70"
                  }
                >
                  {essay.status}
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-black leading-tight md:text-3xl">
                {essay.title}
              </h2>

              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/60 md:text-base">
                {essay.description}
              </p>

              <p className="mt-6 text-sm font-semibold text-cyan-200/70">
                {isDisabled ? "Coming soon" : "Read essay →"}
              </p>
            </div>
          );

          return isDisabled ? (
            <div key={essay.title} className="opacity-80">
              {CardContent}
            </div>
          ) : (
            <Link key={essay.title} href={essay.href}>
              {CardContent}
            </Link>
          );
        })}
      </section>
    </main>
  );
}