//app/essays/page.tsx

import Link from "next/link";
import ESSAYS from "./catalog";
import {
    calculateReadingTime,
    formatDate,
    formatReadingTime,
    toRoman,
} from "./utils";

export const metadata = {
    title: "Essays — Levershare",
    description:
        "A growing collection of essays exploring the philosophical, economic, and technological foundations of Levershare.",
};

const researchThemes = [
    "Human Potential",
    "Visibility",
    "Self-Discovery",
    "Contribution",
    "Technology",
    "Human Development",
    "Economic Participation",
    "Proof of Value",
];

export default function EssaysPage() {
    const publishedEssays = ESSAYS.filter((essay) => essay.status === "Published");
    const featuredEssay =
        ESSAYS.find((essay) => essay.featured && essay.status === "Published") ??
        publishedEssays[0];

    return (
        <main className="min-h-screen bg-zinc-950 px-6 py-20 text-white md:py-24">
            <section className="mx-auto max-w-6xl">
                {/* Hero */}
                <header className="border-b border-white/10 pb-16">
                    <p className="text-xs font-semibold uppercase tracking-[0.38em] text-cyan-300/70">
                        Levershare Essays
                    </p>

                    <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
                        Thinking deserves time.
                    </h1>

                    <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
                        A growing collection exploring the philosophical, economic, and
                        technological foundations behind Levershare.
                    </p>

                    <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/40">
                        Written as an ongoing body of work. Published one idea at a time.
                    </p>
                </header>

                {/* Featured */}
                {featuredEssay && (
                    <section className="grid gap-10 border-b border-white/10 py-16 md:grid-cols-[0.7fr_1.3fr] md:gap-16">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
                                Featured Essay
                            </p>

                            <p className="mt-6 text-7xl font-black tracking-tight text-cyan-200/80 md:text-8xl">
                                {String(featuredEssay.number).padStart(2, "0")}
                            </p>

                            <div className="mt-8 space-y-2 text-xs uppercase tracking-[0.22em] text-white/35">
                                <p>
                                    Part {toRoman(featuredEssay.part)} — {featuredEssay.series}
                                </p>
                                <p>
                                    {formatReadingTime(
                                        calculateReadingTime(featuredEssay.words)
                                    )}
                                </p>
                                <p>Updated {formatDate(featuredEssay.updatedAt)}</p>
                            </div>
                        </div>

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/60">
                                {featuredEssay.label}
                            </p>

                            <h2 className="mt-5 max-w-4xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
                                {featuredEssay.title}
                            </h2>

                            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-white/60">
                                {featuredEssay.subtitle}
                            </p>

                            <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/45">
                                {featuredEssay.summary}
                            </p>

                            <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2">
                                {featuredEssay.categories.map((category) => (
                                    <span
                                        key={category}
                                        className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35"
                                    >
                                        #{category}
                                    </span>
                                ))}
                            </div>

                            <Link
                                href={`/essays/${featuredEssay.slug}`}
                                className="group mt-10 inline-flex items-center gap-2 text-sm font-bold text-cyan-200/75 transition hover:text-cyan-100"
                            >
                                Continue Reading
                                <span className="transition group-hover:translate-x-1">→</span>
                            </Link>
                        </div>
                    </section>
                )}

                {/* Collection */}
                <section className="border-b border-white/10 py-16">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/60">
                                Collection
                            </p>

                            <h2 className="mt-4 text-3xl font-black md:text-4xl">
                                Part I — Foundations
                            </h2>
                        </div>

                        <p className="max-w-md text-sm leading-relaxed text-white/40">
                            Essays are ordered as part of a continuing intellectual sequence.
                        </p>
                    </div>

                    <div className="mt-10 divide-y divide-white/10">
                        {ESSAYS.map((essay) => {
                            const isPublished = essay.status === "Published";

                            const Row = (
                                <div className="group grid gap-5 py-7 transition md:grid-cols-[80px_1fr_170px] md:items-center">
                                    <div className="text-3xl font-black text-white/20 transition group-hover:text-cyan-200/80">
                                        {String(essay.number).padStart(2, "0")}
                                    </div>

                                    <div>
                                        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/35">
                                            <span>{essay.label}</span>
                                            <span>•</span>
                                            <span>
                                                Part {toRoman(essay.part)} — {essay.series}
                                            </span>
                                        </div>

                                        <h3 className="mt-3 text-2xl font-black leading-tight transition group-hover:translate-x-1 md:text-3xl">
                                            {essay.title}
                                        </h3>

                                        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/50 md:text-base">
                                            {essay.summary}
                                        </p>
                                    </div>

                                    <div className="text-left md:text-right">
                                        <p
                                            className={
                                                isPublished
                                                    ? "text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/60"
                                                    : "text-xs font-semibold uppercase tracking-[0.22em] text-amber-200/60"
                                            }
                                        >
                                            {essay.status}
                                        </p>

                                        <p className="mt-2 text-xs text-white/30">
                                            {formatReadingTime(calculateReadingTime(essay.words))}
                                        </p>
                                    </div>
                                </div>
                            );

                            return isPublished ? (
                                <Link key={essay.slug} href={`/essays/${essay.slug}`}>
                                    {Row}
                                </Link>
                            ) : (
                                <div key={essay.slug} className="opacity-70">
                                    {Row}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Research Themes */}
                <section className="py-16">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/60">
                        Research Themes
                    </p>

                    <div className="mt-8 flex flex-wrap gap-x-6 gap-y-4">
                        {researchThemes.map((theme) => (
                            <span
                                key={theme}
                                className="text-sm font-semibold text-white/45 transition hover:text-cyan-200"
                            >
                                {theme}
                            </span>
                        ))}
                    </div>
                </section>
            </section>
        </main>
    );
}