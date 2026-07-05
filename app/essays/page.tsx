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

export default function EssaysPage() {
    return (
        <main className="mx-auto max-w-6xl px-6 py-20 text-white">
            <section className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/70">
                    Levershare Essays
                </p>

                <h1 className="mt-5 text-5xl font-black leading-tight">
                    Essay No. 01 of ∞
                </h1>

                <p className="mt-6 text-lg leading-relaxed text-white/65">
                    A growing collection of essays exploring the philosophical, economic,
                    and technological foundations of Levershare.
                </p>

                <p className="mt-4 text-sm leading-relaxed text-white/45">
                    Essays are published as they are written. They are part of an ongoing
                    body of work and may evolve as new ideas emerge.
                </p>
            </section>

            <section className="mt-14 space-y-5">
                {ESSAYS.map((essay) => {
                    const isDisabled = essay.status !== "Published";

                    const CardContent = (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-cyan-300/30 hover:bg-white/[0.05]">
                            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/40">
                                <span>{essay.label}</span>
                                <span>•</span>
                                <span>
                                    Part {toRoman(essay.part)} — {essay.series}
                                </span>
                                <span>•</span>
                                <span>{formatReadingTime(calculateReadingTime(essay.words))}</span>
                                <span>•</span>
                                <span>Updated {formatDate(essay.updatedAt)}</span>
                            </div>

                            <h2 className="mt-4 text-2xl font-black leading-tight md:text-3xl">
                                {essay.title}
                            </h2>

                            <p className="mt-2 text-base leading-relaxed text-white/45">
                                {essay.subtitle}
                            </p>

                            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/60 md:text-base">
                                {essay.summary}
                            </p>

                            <div className="mt-5 flex flex-wrap gap-2">
                                {essay.categories.map((category) => (
                                    <span
                                        key={category}
                                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45"
                                    >
                                        {category}
                                    </span>
                                ))}
                            </div>

                            <p className="mt-6 text-sm font-semibold text-cyan-200/70">
                                {isDisabled ? "Coming soon" : "Read essay →"}
                            </p>
                        </div>
                    );

                    return isDisabled ? (
                        <div key={essay.slug} className="opacity-80">
                            {CardContent}
                        </div>
                    ) : (
                        <Link key={essay.slug} href={`/essays/${essay.slug}`}>
                            {CardContent}
                        </Link>
                    );
                })}
            </section>
        </main>
    );
}