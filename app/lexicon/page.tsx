// app/lexicon/page.tsx

export const metadata = {
    title: "Lexicon — Levershare",
    description:
        "Key terms, concepts, and definitions used across Levershare and Coincarnation.",
};

export default function LexiconPage() {
    return (
        <main className="min-h-screen bg-zinc-950 px-6 py-20 text-white">
            <section className="mx-auto max-w-4xl">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/70">
                    Levershare Lexicon
                </p>

                <h1 className="mt-5 text-5xl font-black leading-tight md:text-7xl">
                    The language of Levershare.
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/60">
                    A living glossary of the concepts, terms, and definitions used across
                    Coincarnation, Proof of Value, Personal Value Currency, MEGY, and the
                    Levershare Essays.
                </p>

                <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.03] p-8">
                    <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/35">
                        Status
                    </p>

                    <p className="mt-4 text-2xl font-black">Coming soon.</p>

                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/55">
                        The Lexicon will be built as a structured reference system for the
                        core language of the Levershare ecosystem.
                    </p>
                </div>
            </section>
        </main>
    );
}