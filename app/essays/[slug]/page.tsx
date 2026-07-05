//app/essays/[slug]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { ESSAYS } from "@/app/essays/config";

type EssayPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return ESSAYS.map((essay) => ({
    slug: essay.slug,
  }));
}

export async function generateMetadata({ params }: EssayPageProps) {
  const { slug } = await params;
  const essay = ESSAYS.find((item) => item.slug === slug);

  if (!essay) {
    return {
      title: "Essay — Levershare",
    };
  }

  return {
    title: `${essay.title} — Levershare Essays`,
    description: essay.summary,
  };
}

export default async function EssayPage({ params }: EssayPageProps) {
  const { slug } = await params;

  const essayIndex = ESSAYS.findIndex((item) => item.slug === slug);
  const essay = ESSAYS[essayIndex];

  if (!essay) notFound();

  const previousEssay = ESSAYS[essayIndex - 1];
  const nextEssay = ESSAYS[essayIndex + 1];

  const Content = essay.Content;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-20 text-white">
      <Content />

      <nav className="mx-auto mt-16 flex max-w-3xl flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {previousEssay ? (
            <Link
              href={`/essays/${previousEssay.slug}`}
              className="text-sm text-white/50 transition hover:text-cyan-200"
            >
              ← {previousEssay.title}
            </Link>
          ) : (
            <span className="text-sm text-white/25">No previous essay</span>
          )}
        </div>

        <Link
          href="/essays"
          className="text-sm font-semibold text-cyan-200/70 transition hover:text-cyan-100"
        >
          All Essays
        </Link>

        <div className="sm:text-right">
          {nextEssay ? (
            <Link
              href={`/essays/${nextEssay.slug}`}
              className="text-sm text-white/50 transition hover:text-cyan-200"
            >
              {nextEssay.title} →
            </Link>
          ) : (
            <span className="text-sm text-white/25">Next essay writing...</span>
          )}
        </div>
      </nav>
    </main>
  );
}