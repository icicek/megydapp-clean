// app/docs/page.tsx
import Link from "next/link";
import { DOC_SECTIONS } from "./config";

export const metadata = {
  title: "Whitepaper — Coincarnation",
  description:
    "Economic design, pool-proportional distribution, governance, valuation, and risk controls.",
};

export default function DocsIndexPage() {
  return (
    <div className="space-y-6">
      {/* Hero / Intro */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-700/20 via-[#0b0f18] to-[#0b0f18] p-6">
        {/* decorative blob */}
        <svg
          className="absolute -top-12 -right-12 h-48 w-48 opacity-20"
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="currentColor"
            d="M37.6,-57.4C49.1,-51.8,60.7,-44.5,67.2,-33.7C73.6,-22.8,75,-8.5,73.6,5.2C72.2,18.9,68,31.9,60.2,42.8C52.3,53.7,40.9,62.5,28.3,67.2C15.6,71.9,1.7,72.4,-11.3,70.1C-24.3,67.8,-36.4,62.7,-47.3,55.1C-58.2,47.5,-68,37.4,-73.1,25.2C-78.1,13.1,-78.4,-1.2,-73.9,-13.1C-69.3,-25,-60.1,-34.5,-49.6,-40.4C-39.1,-46.3,-27.3,-48.7,-16.6,-55.1C-5.9,-61.5,3.8,-71,14.3,-72.7C24.7,-74.4,36.1,-68.3,37.6,-57.4Z"
            transform="translate(100 100)"
          />
        </svg>

        <div className="relative">
          <h1 className="text-2xl md:text-3xl font-bold">Coincarnation — Whitepaper</h1>
          <p className="text-white/70 mt-2 max-w-2xl">
            A pool-proportional contribution & distribution protocol to revive stranded
            crypto value into <strong>$MEGY</strong>. Use the contents menu to jump into
            sections, or start with the overview below.
          </p>
        </div>

        <div className="mt-4">
          <Link
            href={`/docs/${DOC_SECTIONS[0].slug}`}
            className="inline-flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold"
          >
            Start reading →
          </Link>
        </div>
      </section>

      {/* Sections grid (with badges) */}
      <section className="rounded-2xl border border-white/10 bg-[#0b0f18] p-6">
        <h2 className="text-lg font-semibold">Browse sections</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {DOC_SECTIONS.map((s) => (
            <li key={s.slug} className="rounded-xl border border-white/10">
              <Link
                href={`/docs/${s.slug}`}
                className="block p-4 hover:bg-white/5 rounded-xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{s.title}</div>
                    {s.summary && (
                      <div className="text-xs text-white/60 mt-1">{s.summary}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-[10px] text-white/60 space-x-2">
                    {s.updatedAt && (
                      <span className="inline-block rounded-full border border-white/10 px-2 py-0.5">
                        {s.updatedAt}
                      </span>
                    )}
                    {typeof s.words === "number" && (
                      <span className="inline-block rounded-full border border-white/10 px-2 py-0.5">
                        ~{Math.max(1, Math.round(s.words / 200))}m
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
