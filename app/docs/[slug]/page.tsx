// app/docs/[slug]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { DOC_SECTIONS } from "../config";

export async function generateStaticParams() {
  return DOC_SECTIONS.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const idx = DOC_SECTIONS.findIndex((s) => s.slug === params.slug);
  if (idx === -1) return {};
  const section = DOC_SECTIONS[idx];
  return {
    title: `${section.title} — Coincarnation Whitepaper`,
    description: section.summary || "Coincarnation protocol documentation.",
  };
}

export default function DocSectionPage({ params }: { params: { slug: string } }) {
  const idx = DOC_SECTIONS.findIndex((s) => s.slug === params.slug);
  if (idx === -1) notFound();
  const section = DOC_SECTIONS[idx];
  const Prev =
    idx > 0 ? DOC_SECTIONS[idx - 1] : null;
  const Next =
    idx < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[idx + 1] : null;

  const Content = section.Content;

  return (
    <article className="rounded-2xl border border-white/10 bg-[#0b0f18] p-6">
      <header className="mb-6">
        <div className="text-xs text-white/50">
          <Link href="/docs" className="underline">Whitepaper</Link> / {section.title}
        </div>
        <h1 className="text-2xl font-bold mt-2">{section.title}</h1>
        {section.summary && (
          <p className="text-white/70 mt-2">{section.summary}</p>
        )}
      </header>

      <div className="prose prose-invert max-w-none">
        <Content />
      </div>

      {/* Pager */}
      <footer className="mt-8 flex items-center justify-between border-t border-white/10 pt-4">
        {Prev ? (
          <Link
            href={`/docs/${Prev.slug}`}
            className="text-sm text-white/80 hover:text-white underline"
          >
            ← {Prev.title}
          </Link>
        ) : <span />}

        {Next ? (
          <Link
            href={`/docs/${Next.slug}`}
            className="text-sm text-white/80 hover:text-white underline"
          >
            {Next.title} →
          </Link>
        ) : <span />}
      </footer>
    </article>
  );
}
