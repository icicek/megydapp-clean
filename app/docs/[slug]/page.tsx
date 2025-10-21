import { notFound } from "next/navigation";
import Link from "next/link";
import { DOC_SECTIONS } from "../config";
import PagerHotkeys from "./PagerHotkeys";

// Next 15: params Promise olabildiği için async/await ile ele alıyoruz
export async function generateStaticParams() {
  return DOC_SECTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const idx = DOC_SECTIONS.findIndex((s) => s.slug === slug);
  if (idx === -1) return {};
  const section = DOC_SECTIONS[idx];
  return {
    title: `${section.title} — Coincarnation Whitepaper`,
    description: section.summary || "Coincarnation protocol documentation.",
  };
}

export default async function DocSectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const idx = DOC_SECTIONS.findIndex((s) => s.slug === slug);
  if (idx === -1) notFound();

  const section = DOC_SECTIONS[idx];
  const Prev = idx > 0 ? DOC_SECTIONS[idx - 1] : null;
  const Next = idx < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[idx + 1] : null;
  const Content = section.Content;

  return (
    <article className="rounded-2xl border border-white/10 bg-[#0b0f18] p-6">
      {/* Hotkeys (client) */}
      <PagerHotkeys />

      <header className="mb-6">
        {/* Breadcrumb */}
        <div className="text-xs text-white/50">
          <Link href="/docs" className="underline">
            Whitepaper
          </Link>{" "}
          / {section.title}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold mt-2">{section.title}</h1>

        {/* Summary */}
        {section.summary && (
          <p className="text-white/70 mt-2">{section.summary}</p>
        )}

        {/* Meta badges */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
          {section.updatedAt && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
              <span>Last updated:</span>
              <time dateTime={section.updatedAt}>{section.updatedAt}</time>
            </span>
          )}
          {typeof section.words === "number" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
              ~{Math.max(1, Math.round(section.words / 200))} min read
            </span>
          )}
        </div>
      </header>

      <div className="prose prose-invert max-w-none">
        <Content />
      </div>

      {/* Pager */}
      <footer className="mt-8 flex items-center justify-between border-t border-white/10 pt-4">
        {Prev ? (
          <Link
            id="pager-prev"
            href={`/docs/${Prev.slug}`}
            className="text-sm text-white/80 hover:text-white underline"
          >
            ← {Prev.title}
          </Link>
        ) : (
          <span />
        )}

        {Next ? (
          <Link
            id="pager-next"
            href={`/docs/${Next.slug}`}
            className="text-sm text-white/80 hover:text-white underline"
          >
            {Next.title} →
          </Link>
        ) : (
          <span />
        )}
      </footer>
    </article>
  );
}
