//components/essays/EssayLayout.tsx

import Link from "next/link";
import { EssayEntry } from "@/app/essays/types";
import {
    calculateReadingTime,
    formatDate,
    formatReadingTime,
    toRoman,
} from "@/app/essays/utils";

type EssayLayoutProps = {
    essay: EssayEntry;
    previousEssay?: EssayEntry;
    nextEssay?: EssayEntry;
    children: React.ReactNode;
};

export default function EssayLayout({
    essay,
    previousEssay,
    nextEssay,
    children,
}: EssayLayoutProps) {
    return (
        <main className="min-h-screen bg-zinc-950 px-6 py-20 text-white">
            <article className="mx-auto max-w-3xl">
                <Link
                    href="/essays"
                    className="text-sm font-semibold text-cyan-200/55 transition hover:text-cyan-100"
                >
                    ← All Essays
                </Link>

                <header className="mt-12 border-b border-white/10 pb-12">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/70">
                        {essay.label}
                    </p>

                    <p className="mt-3 text-xs uppercase tracking-[0.22em] text-white/35">
                        Part {toRoman(essay.part)} — {essay.series} ·{" "}
                        {formatReadingTime(calculateReadingTime(essay.words))} · Updated{" "}
                        {formatDate(essay.updatedAt)}
                    </p>

                    <h1 className="mt-8 text-4xl font-black leading-tight md:text-6xl">
                        {essay.title}
                    </h1>

                    <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/55 md:text-xl">
                        {essay.subtitle}
                    </p>

                    <div className="mt-7 flex flex-wrap gap-2">
                        {essay.categories.map((category) => (
                            <span
                                key={category}
                                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/40"
                            >
                                {category}
                            </span>
                        ))}
                    </div>
                </header>

                <div className="mt-12">{children}</div>

                <footer className="mt-20 border-t border-white/10 pt-8">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                                <span className="text-sm text-white/25">
                                    Next essay writing...
                                </span>
                            )}
                        </div>
                    </div>
                </footer>
            </article>
        </main>
    );
}