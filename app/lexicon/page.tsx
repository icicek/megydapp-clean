// app/lexicon/page.tsx

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import LEXICON from "./catalog";
import type { LexiconCategory } from "./types";
import { normalizeLexiconSearch } from "./utils";

const categoryOrder: LexiconCategory[] = [
    "Foundations",
    "Economics",
    "Protocol",
    "Technology",
    "Governance",
];

const categoryDescriptions: Partial<Record<LexiconCategory, string>> = {
    Foundations:
        "The human, philosophical, and conceptual foundations of Levershare.",
    Economics:
        "Concepts related to participation, value, recognition, and economic outcomes.",
    Protocol:
        "The mechanisms, assets, and structures that define the Levershare ecosystem.",
    Technology:
        "The technical layers that support identity, verification, coordination, and trust.",
    Governance:
        "Concepts related to collective decision-making, responsibility, and institutional evolution.",
};

export default function LexiconPage() {
    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState<
        LexiconCategory | "All"
    >("All");

    const publishedEntries = useMemo(
        () =>
            LEXICON.filter((entry) => entry.status === "Published").sort(
                (a, b) => a.order - b.order
            ),
        []
    );

    const availableCategories = useMemo(
        () =>
            categoryOrder.filter((category) =>
                publishedEntries.some((entry) => entry.category === category)
            ),
        [publishedEntries]
    );

    const filteredEntries = useMemo(() => {
        const normalizedQuery = normalizeLexiconSearch(query);

        return publishedEntries.filter((entry) => {
            const categoryMatches =
                activeCategory === "All" || entry.category === activeCategory;

            if (!categoryMatches) {
                return false;
            }

            if (!normalizedQuery) {
                return true;
            }

            const searchableText = normalizeLexiconSearch(
                [
                    entry.title,
                    entry.shortDefinition,
                    entry.category,
                    entry.description,
                    ...(entry.aliases ?? []),
                    ...entry.keywords,
                ].join(" ")
            );

            return searchableText.includes(normalizedQuery);
        });
    }, [activeCategory, publishedEntries, query]);

    const groupedEntries = useMemo(
        () =>
            availableCategories
                .map((category) => ({
                    category,
                    entries: filteredEntries.filter(
                        (entry) => entry.category === category
                    ),
                }))
                .filter((group) => group.entries.length > 0),
        [availableCategories, filteredEntries]
    );

    const featuredEntries = publishedEntries.filter((entry) => entry.featured);

    return (
        <main className="min-h-screen bg-zinc-950 px-6 py-20 text-white md:py-24">
            <section className="mx-auto max-w-6xl">
                {/* Hero */}
                <header className="border-b border-white/10 pb-16">
                    <p className="text-xs font-semibold uppercase tracking-[0.38em] text-cyan-300/70">
                        Levershare Lexicon
                    </p>

                    <h1 className="mt-6 max-w-5xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
                        The shared language of Levershare.
                    </h1>

                    <p className="mt-8 max-w-3xl text-lg leading-relaxed text-white/60 md:text-xl">
                        A living reference system for the concepts, definitions, and
                        relationships that connect Levershare, Coincarnation, Proof of Value,
                        Personal Value Currency, and the Essays.
                    </p>

                    <div className="mt-10 max-w-2xl border-l border-cyan-300/25 pl-6">
                        <p className="text-base leading-8 text-white/55 md:text-lg">
                            Words shape thought. Thought shapes systems. Systems shape
                            civilization.
                        </p>

                        <p className="mt-3 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200/55">
                            Every ecosystem eventually develops its own language. This is ours.
                        </p>
                    </div>
                </header>

                {/* Featured */}
                {featuredEntries.length > 0 && (
                    <section className="border-b border-white/10 py-16">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/60">
                                    Start Here
                                </p>

                                <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
                                    Foundational concepts
                                </h2>
                            </div>

                            <p className="max-w-md text-sm leading-relaxed text-white/40">
                                These concepts form the first layer of the Levershare knowledge
                                system.
                            </p>
                        </div>

                        <div className="mt-10 grid gap-4 md:grid-cols-3">
                            {featuredEntries.map((entry, index) => (
                                <Link
                                    key={entry.slug}
                                    href={`/lexicon/${entry.slug}`}
                                    className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-white/[0.045]"
                                >
                                    <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-300/[0.04] blur-2xl transition group-hover:bg-cyan-300/[0.08]" />

                                    <div className="relative">
                                        <div className="flex items-center justify-between gap-4">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
                                                {entry.category}
                                            </p>

                                            <span className="text-xs font-black text-white/20">
                                                {String(index + 1).padStart(2, "0")}
                                            </span>
                                        </div>

                                        <h3 className="mt-6 text-2xl font-black leading-tight transition group-hover:text-cyan-100">
                                            {entry.title}
                                        </h3>

                                        <p className="mt-4 text-sm leading-relaxed text-white/50">
                                            {entry.shortDefinition}
                                        </p>

                                        <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200/65">
                                            Open concept
                                            <span className="transition group-hover:translate-x-1">
                                                →
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* Search and filters */}
                <section className="border-b border-white/10 py-12">
                    <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                        <div>
                            <label
                                htmlFor="lexicon-search"
                                className="text-xs font-semibold uppercase tracking-[0.28em] text-white/35"
                            >
                                Search the Lexicon
                            </label>

                            <div className="relative mt-4 max-w-2xl">
                                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-lg text-white/25">
                                    ⌕
                                </span>

                                <input
                                    id="lexicon-search"
                                    type="search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Search concepts, aliases, and definitions..."
                                    className="w-full rounded-2xl border border-white/10 bg-white/[0.025] py-4 pl-12 pr-5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/30 focus:bg-white/[0.04]"
                                />
                            </div>
                        </div>

                        <p className="text-sm text-white/35 lg:pb-4">
                            {filteredEntries.length}{" "}
                            {filteredEntries.length === 1 ? "concept" : "concepts"}
                        </p>
                    </div>

                    <div className="mt-7 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveCategory("All")}
                            className={[
                                "rounded-full border px-4 py-2 text-xs font-semibold transition",
                                activeCategory === "All"
                                    ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                                    : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/65",
                            ].join(" ")}
                        >
                            All
                        </button>

                        {availableCategories.map((category) => (
                            <button
                                key={category}
                                type="button"
                                onClick={() => setActiveCategory(category)}
                                className={[
                                    "rounded-full border px-4 py-2 text-xs font-semibold transition",
                                    activeCategory === category
                                        ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                                        : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/65",
                                ].join(" ")}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Results */}
                <section className="py-16">
                    {groupedEntries.length > 0 ? (
                        <div className="space-y-16">
                            {groupedEntries.map(({ category, entries }) => (
                                <section key={category}>
                                    <div className="grid gap-5 border-b border-white/10 pb-7 md:grid-cols-[1fr_1.5fr] md:items-end">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/60">
                                                {category}
                                            </p>

                                            <h2 className="mt-3 text-3xl font-black md:text-4xl">
                                                {category}
                                            </h2>
                                        </div>

                                        <p className="max-w-xl text-sm leading-relaxed text-white/40 md:justify-self-end md:text-right">
                                            {categoryDescriptions[category]}
                                        </p>
                                    </div>

                                    <div className="divide-y divide-white/10">
                                        {entries.map((entry) => (
                                            <Link
                                                key={entry.slug}
                                                href={`/lexicon/${entry.slug}`}
                                                className="group block"
                                            >
                                                <article className="grid gap-6 py-9 transition md:grid-cols-[1fr_190px] md:items-center">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/30">
                                                            <span>{entry.category}</span>

                                                            <span>•</span>

                                                            <span>Version {entry.revision}</span>

                                                            {entry.aliases && entry.aliases.length > 0 && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>
                                                                        Also known as {entry.aliases.join(", ")}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>

                                                        <h3 className="mt-4 text-2xl font-black leading-tight transition group-hover:translate-x-1 group-hover:text-cyan-100 md:text-3xl">
                                                            {entry.title}
                                                        </h3>

                                                        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/50 md:text-base">
                                                            {entry.shortDefinition}
                                                        </p>

                                                        {entry.relatedConcepts &&
                                                            entry.relatedConcepts.length > 0 && (
                                                                <div className="mt-5 flex flex-wrap gap-2">
                                                                    {entry.relatedConcepts.map((related) => (
                                                                        <span
                                                                            key={related.slug}
                                                                            className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/35"
                                                                        >
                                                                            {related.title}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                    </div>

                                                    <div className="text-left md:text-right">
                                                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-200/65 transition group-hover:text-cyan-100">
                                                            View definition
                                                            <span className="transition group-hover:translate-x-1">
                                                                →
                                                            </span>
                                                        </span>
                                                    </div>
                                                </article>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/30">
                                No matching concepts
                            </p>

                            <h2 className="mt-4 text-2xl font-black">
                                Nothing matched your search.
                            </h2>

                            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/45">
                                Try a different term or return to all categories.
                            </p>

                            <button
                                type="button"
                                onClick={() => {
                                    setQuery("");
                                    setActiveCategory("All");
                                }}
                                className="mt-7 text-sm font-semibold text-cyan-200/70 transition hover:text-cyan-100"
                            >
                                Reset search
                            </button>
                        </div>
                    )}
                </section>
            </section>
        </main>
    );
}