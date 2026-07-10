// components/essays/RecognitionBoundary.tsx

const principles = [
    {
        number: "01",
        title: "Responsible Measurement",
        description:
            "Recognition should focus only on contribution that can be observed with sufficient reliability.",
    },
    {
        number: "02",
        title: "Human Judgment",
        description:
            "Data may inform recognition, but judgment remains necessary for context and interpretation.",
    },
    {
        number: "03",
        title: "Ethical Boundaries",
        description:
            "Not every meaningful human action should become measurable, transactional, or economic.",
    },
    {
        number: "04",
        title: "Revision & Accountability",
        description:
            "Recognition systems must remain open to correction, challenge, and continuous improvement.",
    },
];

export default function RecognitionBoundary() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-5 md:p-8">
            <figcaption>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/35">
                    Recognition Boundary
                </p>

                <h3 className="mt-3 max-w-2xl text-2xl font-black leading-tight text-white md:text-3xl">
                    Recognize more without attempting to measure everything
                </h3>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">
                    Greater recognition is valuable only when it is paired with restraint,
                    context, accountability, and respect for what should remain outside
                    economic calculation.
                </p>
            </figcaption>

            <div className="mt-9 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-red-300/15 bg-red-300/[0.04] p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-red-200/55">
                        Avoid
                    </p>

                    <div className="mt-5 flex items-center gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-300/20 bg-black/20 text-lg text-red-200/70">
                            ×
                        </span>

                        <div>
                            <h4 className="font-black text-white">Measure Everything</h4>
                            <p className="mt-2 text-sm leading-relaxed text-white/45">
                                More data does not automatically produce better judgment,
                                fairness, or understanding.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="rounded-3xl border border-emerald-300/15 bg-emerald-300/[0.04] p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-200/55">
                        Prefer
                    </p>

                    <div className="mt-5 flex items-center gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-black/20 text-lg text-emerald-200/80">
                            ✓
                        </span>

                        <div>
                            <h4 className="font-black text-white">
                                Recognize Responsibly
                            </h4>
                            <p className="mt-2 text-sm leading-relaxed text-white/45">
                                Expand recognition only where contribution can be understood,
                                verified, and evaluated responsibly.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {principles.map((principle) => (
                    <div
                        key={principle.title}
                        className="rounded-2xl border border-white/10 bg-black/20 p-5"
                    >
                        <p className="text-[10px] font-black tracking-[0.22em] text-cyan-200/45">
                            {principle.number}
                        </p>

                        <h4 className="mt-3 font-black text-white">
                            {principle.title}
                        </h4>

                        <p className="mt-2 text-sm leading-relaxed text-white/45">
                            {principle.description}
                        </p>
                    </div>
                ))}
            </div>
        </figure>
    );
}