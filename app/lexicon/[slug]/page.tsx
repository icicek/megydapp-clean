// app/lexicon/[slug]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import LEXICON from "../catalog";
import { formatLexiconDate } from "../utils";

type LexiconPageProps = {
    params: Promise<{
        slug: string;
    }>;
};

export function generateStaticParams() {
    return LEXICON.filter((entry) => entry.status === "Published").map(
        (entry) => ({
            slug: entry.slug,
        })
    );
}

export async function generateMetadata({ params }: LexiconPageProps) {
    const { slug } = await params;

    const entry = LEXICON.find(
        (item) => item.slug === slug && item.status === "Published"
    );

    if (!entry) {
        return {
            title: "Lexicon — Levershare",
            description:
                "Concepts, terms, and definitions used across Levershare and Coincarnation.",
        };
    }

    return {
        title: `${entry.title} — Levershare Lexicon`,
        description: entry.description,
        keywords: entry.keywords,
        alternates: {
            canonical: `/lexicon/${entry.slug}`,
        },
        openGraph: {
            title: `${entry.title} — Levershare Lexicon`,
            description: entry.description,
            type: "article",
            url: `/lexicon/${entry.slug}`,
            siteName: "Levershare",
        },
        twitter: {
            card: "summary_large_image",
            title: `${entry.title} — Levershare Lexicon`,
            description: entry.description,
        },
    };
}

export default async function LexiconEntryPage({
    params,
}: LexiconPageProps) {
    const { slug } = await params;

    const entryIndex = LEXICON.findIndex(
        (item) => item.slug === slug && item.status === "Published"
    );

    if (entryIndex === -1) {
        notFound();
    }

    const entry = LEXICON[entryIndex];
    const Content = entry.Content;

    const previousEntry = [...LEXICON]
        .slice(0, entryIndex)
        .reverse()
        .find((item) => item.status === "Published");

    const nextEntry = LEXICON.slice(entryIndex + 1).find(
        (item) => item.status === "Published"
    );

    const relatedEntries =
        entry.relatedConcepts
            ?.map((related) =>
                LEXICON.find(
                    (item) =>
                        item.slug === related.slug && item.status === "Published"
                )
            )
            .filter(
                (
                    related
                ): related is (typeof LEXICON)[number] => Boolean(related)
            ) ?? [];

    return (
        <main className="min-h-screen bg-zinc-950 px-6 py-16 text-white md:py-20">
            <article className="mx-auto max-w-5xl">
                <Link
                    href="/lexicon"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-200/55 transition hover:text-cyan-100"
                >
                    <span>←</span>
                    <span>Back to Lexicon</span>
                </Link>

                <header className="mt-12 border-b border-white/10 pb-12">
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/30">
                        <span className="text-cyan-200/65">{entry.category}</span>
                        <span>•</span>
                        <span>Version {entry.revision}</span>
                        <span>•</span>
                        <span>Updated {formatLexiconDate(entry.updatedAt)}</span>
                    </div>

                    <h1 className="mt-7 max-w-4xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
                        {entry.title}
                    </h1>

                    <p className="mt-6 max-w-3xl text-lg leading-relaxed text-white/65 md:text-xl">
                        {entry.shortDefinition}
                    </p>

                    {entry.aliases && entry.aliases.length > 0 && (
                        <div className="mt-7">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/30">
                                Also known as
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {entry.aliases.map((alias) => (
                                    <span
                                        key={alias}
                                        className="rounded-full border border-white/10 bg-white/[0.025] px-3 py-1 text-xs text-white/45"
                                    >
                                        {alias}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </header>

                <div className="mt-14 grid gap-14 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                    <div className="min-w-0">
                        <Content />
                    </div>

                    <aside className="space-y-6 xl:sticky xl:top-24">
                        <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
                                Concept Summary
                            </p>

                            <dl className="mt-6 space-y-5">
                                <div>
                                    <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
                                        Category
                                    </dt>

                                    <dd className="mt-2 text-sm font-semibold text-white/70">
                                        {entry.category}
                                    </dd>
                                </div>

                                <div>
                                    <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
                                        Status
                                    </dt>

                                    <dd className="mt-2 text-sm font-semibold text-emerald-200/70">
                                        {entry.status}
                                    </dd>
                                </div>

                                <div>
                                    <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
                                        Revision
                                    </dt>

                                    <dd className="mt-2 text-sm font-semibold text-white/70">
                                        {entry.revision}
                                    </dd>
                                </div>

                                <div>
                                    <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
                                        Updated
                                    </dt>

                                    <dd className="mt-2 text-sm font-semibold text-white/70">
                                        {formatLexiconDate(entry.updatedAt)}
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        {relatedEntries.length > 0 && (
                            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
                                    Related Concepts
                                </p>

                                <nav className="mt-5 space-y-3">
                                    {relatedEntries.map((related) => (
                                        <Link
                                            key={related.slug}
                                            href={`/lexicon/${related.slug}`}
                                            className="group block rounded-2xl border border-white/10 bg-black/15 p-4 transition hover:border-cyan-300/25 hover:bg-white/[0.035]"
                                        >
                                            <p className="font-black text-white transition group-hover:text-cyan-100">
                                                {related.title}
                                            </p>

                                            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-white/40">
                                                {related.shortDefinition}
                                            </p>

                                            <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200/60">
                                                Open concept
                                                <span className="transition group-hover:translate-x-1">
                                                    →
                                                </span>
                                            </span>
                                        </Link>
                                    ))}
                                </nav>
                            </section>
                        )}

                        {entry.references && entry.references.length > 0 && (
                            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
                                    References
                                </p>

                                <div className="mt-5 space-y-3">
                                    {entry.references.map((reference) => {
                                        const isExternal = reference.type === "External";

                                        return (
                                            <Link
                                                key={`${reference.type}-${reference.href}-${reference.label}`}
                                                href={reference.href}
                                                target={isExternal ? "_blank" : undefined}
                                                rel={
                                                    isExternal
                                                        ? "noopener noreferrer"
                                                        : undefined
                                                }
                                                className="group block rounded-2xl border border-white/10 bg-black/15 p-4 transition hover:border-cyan-300/25 hover:bg-white/[0.035]"
                                            >
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
                                                    {reference.type}
                                                </p>

                                                <p className="mt-2 text-sm font-semibold leading-relaxed text-white/65 transition group-hover:text-cyan-100">
                                                    {reference.label}
                                                </p>

                                                <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200/55">
                                                    Open reference
                                                    <span className="transition group-hover:translate-x-1">
                                                        {isExternal ? "↗" : "→"}
                                                    </span>
                                                </span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </section>
                        )}
                    </aside>
                </div>

                <footer className="mt-20 border-t border-white/10 pt-8">
                    <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                        <div>
                            {previousEntry ? (
                                <Link
                                    href={`/lexicon/${previousEntry.slug}`}
                                    className="group inline-flex flex-col text-sm"
                                >
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">
                                        Previous concept
                                    </span>

                                    <span className="mt-2 text-white/50 transition group-hover:text-cyan-200">
                                        ← {previousEntry.title}
                                    </span>
                                </Link>
                            ) : (
                                <span className="text-sm text-white/25">
                                    No previous concept
                                </span>
                            )}
                        </div>

                        <Link
                            href="/lexicon"
                            className="text-sm font-semibold text-cyan-200/70 transition hover:text-cyan-100"
                        >
                            All Concepts
                        </Link>

                        <div className="sm:text-right">
                            {nextEntry ? (
                                <Link
                                    href={`/lexicon/${nextEntry.slug}`}
                                    className="group inline-flex flex-col sm:items-end text-sm"
                                >
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">
                                        Next concept
                                    </span>

                                    <span className="mt-2 text-white/50 transition group-hover:text-cyan-200">
                                        {nextEntry.title} →
                                    </span>
                                </Link>
                            ) : (
                                <span className="text-sm text-white/25">
                                    End of current Lexicon
                                </span>
                            )}
                        </div>
                    </div>
                </footer>
            </article>
        </main>
    );
}