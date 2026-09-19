// app/docs/print/page.tsx

import Link from "next/link";
import { DOC_SECTIONS } from "../config";
import PrintToolbar from "./PrintToolbar";

export const metadata = {
  title: "Coincarnation — Whitepaper — PDF / Publication View",
  description:
    "Publication-optimized whitepaper view for PDF export and printing.",
};

export default function DocsPrintPage() {
  return (
    <div className="whitepaper-print min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <PrintToolbar />

        <header className="mb-8">
          <h1 className="text-3xl font-bold">Coincarnation — Whitepaper</h1>

          <p className="mt-2 text-black/70">
            Publication view optimized for PDF export and printing. For sectioned
            reading, use{" "}
            <Link href="/docs" className="underline">
              the docs index
            </Link>.
          </p>
        </header>

        {DOC_SECTIONS.map((s, i) => {
          const Content = s.Content;

          return (
            <article key={s.slug} className="whitepaper-print-section mb-12">
              <h2 className="mb-2 text-2xl font-semibold">
                {i + 1}. {s.title}
              </h2>

              {s.summary && (
                <p className="mb-3 text-black/70">{s.summary}</p>
              )}

              <div className="text-[15px] leading-relaxed">
                <Content />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}