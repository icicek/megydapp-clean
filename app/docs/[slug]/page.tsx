//app/docs/[slug]/page.tsx

// app/docs/[slug]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_SECTIONS } from "../config";
import PagerHotkeys from "./PagerHotkeys";

type DocPageProps = {
    params: Promise<{
        slug: string;
    }>;
};

export function generateStaticParams() {
    return DOC_SECTIONS.map((section) => ({
        slug: section.slug,
    }));
}

export async function generateMetadata({ params }: DocPageProps) {
    const { slug } = await params;
    const section = DOC_SECTIONS.find((item) => item.slug === slug);

    if (!section) {
        return {
            title: "Whitepaper — Coincarnation",
        };
    }

    return {
        title: `${section.title} — Coincarnation Whitepaper`,
        description: section.summary,
    };
}

export default async function DocSectionPage({ params }: DocPageProps) {
    const { slug } = await params;

    const sectionIndex = DOC_SECTIONS.findIndex((item) => item.slug === slug);
    const section = DOC_SECTIONS[sectionIndex];

    if (!section) notFound();

    const previousSection = DOC_SECTIONS[sectionIndex - 1];
    const nextSection = DOC_SECTIONS[sectionIndex + 1];

    const Content = section.Content;

    return (
        <main className="mx-auto max-w-5xl px-6 py-16 text-white">
            <PagerHotkeys />

            <article>
                <div className="mb-10">
                    <Link
                        href="/docs"
                        className="text-sm font-semibold text-cyan-200/60 transition hover:text-cyan-100"
                    >
                        ← Whitepaper
                    </Link>

                    <p className="mt-8 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/70">
                        Coincarnation Whitepaper
                    </p>

                    <h1 className="mt-4 text-4xl font-black leading-tight md:text-6xl">
                        {section.title}
                    </h1>

                    {section.summary && (
                        <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/55 md:text-lg">
                            {section.summary}
                        </p>
                    )}

                    <div className="mt-8 border-t border-white/10" />
                </div>

                <Content />
            </article>

            <nav className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    {previousSection ? (
                        <Link
                            id="pager-prev"
                            href={`/docs/${previousSection.slug}`}
                            className="text-sm text-white/50 transition hover:text-cyan-200"
                        >
                            ← {previousSection.title}
                        </Link>
                    ) : (
                        <span className="text-sm text-white/25">No previous section</span>
                    )}
                </div>

                <Link
                    href="/docs"
                    className="text-sm font-semibold text-cyan-200/70 transition hover:text-cyan-100"
                >
                    All Sections
                </Link>

                <div className="sm:text-right">
                    {nextSection ? (
                        <Link
                            id="pager-next"
                            href={`/docs/${nextSection.slug}`}
                            className="text-sm text-white/50 transition hover:text-cyan-200"
                        >
                            {nextSection.title} →
                        </Link>
                    ) : (
                        <span className="text-sm text-white/25">End of whitepaper</span>
                    )}
                </div>
            </nav>
        </main>
    );
}