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
    <div className="rounded-2xl border border-white/10 bg-[#0b0f18] p-6">
      <h1 className="text-2xl font-bold">Coincarnation — Whitepaper</h1>
      <p className="text-white/70 mt-2">
        Explore the protocol across focused sections. Use the sidebar to jump,
        or browse below.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {DOC_SECTIONS.map((s) => (
          <li key={s.slug} className="rounded-xl border border-white/10">
            <Link
              href={`/docs/${s.slug}`}
              className="block p-4 hover:bg-white/5 rounded-xl"
            >
              <div className="text-sm font-semibold">{s.title}</div>
              {s.summary && (
                <div className="text-xs text-white/60 mt-1">{s.summary}</div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Link
          href={`/docs/${DOC_SECTIONS[0].slug}`}
          className="inline-flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold"
        >
          Start reading →
        </Link>
      </div>
    </div>
  );
}
