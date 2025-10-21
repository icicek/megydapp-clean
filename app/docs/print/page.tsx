// app/docs/print/page.tsx
import Link from "next/link";
import { DOC_SECTIONS } from "../config";
import PrintToolbar from "./PrintToolbar";

export const metadata = {
  title: "Coincarnation — Whitepaper (Print)",
  description: "Single-page printable whitepaper view.",
};

export default function DocsPrintPage() {
  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <PrintToolbar />

        <header className="mb-8">
          <h1 className="text-3xl font-bold">Coincarnation — Whitepaper</h1>
          <p className="text-black/70 mt-2">
            Single-page view. For sectioned reading, use{" "}
            <Link href="/docs" className="underline">
              the docs index
            </Link>.
          </p>
        </header>

        {DOC_SECTIONS.map((s, i) => {
          const Content = s.Content;
          return (
            <article key={s.slug} className="mb-10 break-inside-avoid">
              <h2 className="text-2xl font-semibold mb-2">
                {i + 1}. {s.title}
              </h2>
              {s.summary && (
                <p className="text-black/70 mb-3">{s.summary}</p>
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
