//app/essays/[slug]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import ESSAYS from "../catalog";
import {
    calculateReadingTime,
    formatDate,
    formatReadingTime,
    toRoman,
} from "../utils";

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
        description: essay.description,
        keywords: essay.keywords,
        openGraph: {
            title: essay.title,
            description: essay.description,
            type: "article",
            publishedTime: essay.publishedAt,
            modifiedTime: essay.updatedAt,
        },
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
            <article className="mx-auto max-w-3xl">
                <Link
                    href="/essays"
                    className="text-sm font-semibold text-cyan-200/60 transition hover:text-cyan-100"
                >
                    ← All Essays
                </Link>

                <div className="mt-8 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/40">
                    <span>{essay.label}</span>
                    <span>•</span>
                    <span>
                        Part {toRoman(essay.part)} — {essay.series}
                    </span>
                    <span>•</span>
                    <span>{formatReadingTime(calculateReadingTime(essay.words))}</span>
                    <span>•</span>
                    <span>Updated {formatDate(essay.updatedAt)}</span>
                    <span>•</span>
                    <span>Revision {essay.revision}</span>
                </div>

                <h1 className="mt-5 text-4xl font-black leading-tight md:text-6xl">
                    {essay.title}
                </h1>

                <p className="mt-5 text-lg leading-relaxed text-white/55 md:text-xl">
                    {essay.subtitle}
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                    {essay.categories.map((category) => (
                        <span
                            key={category}
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45"
                        >
                            {category}
                        </span>
                    ))}
                </div>

                <div className="mt-10 border-t border-white/10" />
            </article>

            <div className="mt-10">
                <Content />
            </div>

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