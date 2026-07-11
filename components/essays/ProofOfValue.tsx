// components/essays/ProofOfValue.tsx

const stages = [
    {
        number: "01",
        title: "Meaningful Contribution",
        description:
            "A person performs an action, applies a capability, shares a resource, solves a problem, or otherwise helps create, preserve, coordinate, or expand value.",
        effect: "Value is created",
        numberBorder: "border-violet-400/70",
        numberText: "text-violet-100",
        connector: "from-violet-400/80 to-violet-400/30",
        effectLabel: "text-violet-300/75",
        effectBorder: "border-violet-300/15",
        effectBackground: "bg-violet-300/[0.035]",
    },
    {
        number: "02",
        title: "Context",
        description:
            "The contribution is understood within the circumstances, needs, relationships, constraints, and objectives that give it meaning.",
        effect: "Meaning is established",
        numberBorder: "border-indigo-400/70",
        numberText: "text-indigo-100",
        connector: "from-indigo-400/80 to-indigo-400/30",
        effectLabel: "text-indigo-300/75",
        effectBorder: "border-indigo-300/15",
        effectBackground: "bg-indigo-300/[0.035]",
    },
    {
        number: "03",
        title: "Evidence",
        description:
            "Relevant records, observations, outcomes, attestations, data, or other signals make the contribution more observable and attributable.",
        effect: "Contribution becomes visible",
        numberBorder: "border-blue-400/70",
        numberText: "text-blue-100",
        connector: "from-blue-400/80 to-blue-400/30",
        effectLabel: "text-blue-300/75",
        effectBorder: "border-blue-300/15",
        effectBackground: "bg-blue-300/[0.035]",
    },
    {
        number: "04",
        title: "Verification",
        description:
            "Available evidence is examined for authenticity, relevance, consistency, and sufficient connection to the contributor and context.",
        effect: "Evidence gains reliability",
        numberBorder: "border-sky-400/70",
        numberText: "text-sky-100",
        connector: "from-sky-400/80 to-sky-400/30",
        effectLabel: "text-sky-300/75",
        effectBorder: "border-sky-300/15",
        effectBackground: "bg-sky-300/[0.035]",
    },
    {
        number: "05",
        title: "Recognition",
        description:
            "A system or community becomes better able to understand and respond to the value represented by the contribution.",
        effect: "Value becomes recognizable",
        numberBorder: "border-cyan-400/70",
        numberText: "text-cyan-100",
        connector: "from-cyan-400/80 to-cyan-400/30",
        effectLabel: "text-cyan-300/75",
        effectBorder: "border-cyan-300/15",
        effectBackground: "bg-cyan-300/[0.035]",
    },
    {
        number: "06",
        title: "Participation",
        description:
            "Recognized contribution may inform trust, reputation, collaboration, responsibility, opportunity, ownership, or optional economic outcomes.",
        effect: "Recognition becomes actionable",
        numberBorder: "border-emerald-400/70",
        numberText: "text-emerald-100",
        connector: "from-emerald-400/80 to-emerald-400/30",
        effectLabel: "text-emerald-300/75",
        effectBorder: "border-emerald-300/15",
        effectBackground: "bg-emerald-300/[0.035]",
    },
] as const;

export default function ProofOfValue() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-400/[0.08] via-white/[0.02] to-cyan-400/[0.05] p-5 shadow-[0_30px_100px_rgba(124,58,237,0.08)] md:p-8">
            <figcaption>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-violet-200/70">
                        The Proof of Value Framework
                    </p>

                    <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
                        Contribution → Participation
                    </span>
                </div>

                <h3 className="mt-4 max-w-3xl text-2xl font-black leading-tight text-white md:text-3xl">
                    Proof does not create value. It helps value become more visible,
                    understandable, and actionable.
                </h3>

                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/50 md:text-base">
                    Proof of Value organizes the pathway through which meaningful
                    contribution may become contextualized, evidenced, verified,
                    recognized, and connected with participation.
                </p>
            </figcaption>

            {/* Desktop timeline */}
            <div className="mt-10 hidden space-y-5 md:block">
                {stages.map((stage, index) => {
                    const isFirst = index === 0;
                    const isLast = index === stages.length - 1;

                    return (
                        <div
                            key={stage.title}
                            className="grid grid-cols-[112px_minmax(0,1fr)] items-stretch"
                        >
                            {/* Controlled timeline column */}
                            <div className="relative flex min-h-[190px] items-center">
                                {!isFirst && (
                                    <div className="absolute left-[47px] top-0 h-1/2 w-px bg-white/10" />
                                )}

                                {!isLast && (
                                    <div className="absolute bottom-0 left-[47px] h-1/2 w-px bg-white/10" />
                                )}

                                <div
                                    className={[
                                        "relative z-10 flex h-16 w-16 items-center justify-center rounded-full border bg-[#0b0b11] text-sm font-black tracking-[0.14em] shadow-[0_0_30px_rgba(124,58,237,0.08)]",
                                        stage.numberBorder,
                                        stage.numberText,
                                    ].join(" ")}
                                >
                                    {stage.number}
                                </div>

                                <div
                                    className={[
                                        "absolute left-16 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r",
                                        stage.connector,
                                    ].join(" ")}
                                />

                                <div
                                    className={[
                                        "absolute right-0 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-black/40",
                                        stage.effectBackground,
                                        stage.numberBorder,
                                    ].join(" ")}
                                />
                            </div>

                            {/* Content card */}
                            <article className="ml-0 grid min-h-[190px] grid-cols-[minmax(0,1fr)_minmax(230px,0.42fr)] items-center gap-8 rounded-3xl border border-white/10 bg-black/20 px-8 py-7 transition duration-300 hover:border-white/15 hover:bg-white/[0.025]">
                                <div className="min-w-0">
                                    <h4 className="text-xl font-black text-white">
                                        {stage.title}
                                    </h4>

                                    <p className="mt-4 max-w-2xl text-[15px] leading-7 text-white/48">
                                        {stage.description}
                                    </p>
                                </div>

                                <div className="border-l border-white/10 pl-8">
                                    <div
                                        className={[
                                            "rounded-2xl border p-5",
                                            stage.effectBorder,
                                            stage.effectBackground,
                                        ].join(" ")}
                                    >
                                        <p
                                            className={[
                                                "text-[10px] font-bold uppercase tracking-[0.26em]",
                                                stage.effectLabel,
                                            ].join(" ")}
                                        >
                                            System Effect
                                        </p>

                                        <p className="mt-4 text-base font-black leading-relaxed text-white/75">
                                            {stage.effect}
                                        </p>
                                    </div>
                                </div>
                            </article>
                        </div>
                    );
                })}
            </div>

            {/* Mobile layout */}
            <div className="mt-9 space-y-4 md:hidden">
                {stages.map((stage) => (
                    <article
                        key={stage.title}
                        className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-5"
                    >
                        <div className="flex items-start gap-4">
                            <div
                                className={[
                                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-black/30 text-[11px] font-black tracking-[0.16em]",
                                    stage.numberBorder,
                                    stage.numberText,
                                ].join(" ")}
                            >
                                {stage.number}
                            </div>

                            <div className="min-w-0">
                                <h4 className="text-lg font-black text-white">
                                    {stage.title}
                                </h4>

                                <p className="mt-3 text-sm leading-7 text-white/48">
                                    {stage.description}
                                </p>
                            </div>
                        </div>

                        <div
                            className={[
                                "mt-5 rounded-xl border p-4",
                                stage.effectBorder,
                                stage.effectBackground,
                            ].join(" ")}
                        >
                            <p
                                className={[
                                    "text-[9px] font-bold uppercase tracking-[0.24em]",
                                    stage.effectLabel,
                                ].join(" ")}
                            >
                                System Effect
                            </p>

                            <p className="mt-3 text-sm font-black leading-relaxed text-white/70">
                                {stage.effect}
                            </p>
                        </div>
                    </article>
                ))}
            </div>

            <div className="mt-9 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-violet-200/10 bg-black/25 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-violet-200/55">
                        What PoV Produces
                    </p>

                    <p className="mt-3 text-sm leading-relaxed text-white/50">
                        Structured and contextual evidence that may improve how
                        contribution is understood, attributed, verified, remembered,
                        and recognized.
                    </p>
                </div>

                <div className="rounded-2xl border border-amber-200/10 bg-black/25 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-200/55">
                        What PoV Does Not Produce
                    </p>

                    <p className="mt-3 text-sm leading-relaxed text-white/50">
                        A complete measurement of human worth, an automatic entitlement
                        to reward, or a universal price for every form of human activity.
                    </p>
                </div>
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-200/10 bg-gradient-to-r from-cyan-300/[0.045] via-white/[0.02] to-violet-300/[0.045] p-5 text-center">
                <p className="text-sm font-semibold leading-relaxed text-white/65">
                    Better evidence may support better recognition. Better recognition
                    may support more meaningful participation.
                </p>
            </div>
        </figure>
    );
}