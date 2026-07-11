// components/essays/ProofOfValue.tsx

const stages = [
    {
        number: "01",
        title: "Meaningful Contribution",
        description:
            "A person performs an action, applies a capability, shares a resource, solves a problem, or otherwise helps create, preserve, coordinate, or expand value.",
        signal: "Value is created",
    },
    {
        number: "02",
        title: "Context",
        description:
            "The contribution is understood within the circumstances, needs, relationships, constraints, and objectives that give it meaning.",
        signal: "Meaning is established",
    },
    {
        number: "03",
        title: "Evidence",
        description:
            "Relevant records, observations, outcomes, attestations, data, or other signals make the contribution more observable and attributable.",
        signal: "Contribution becomes visible",
    },
    {
        number: "04",
        title: "Verification",
        description:
            "Available evidence is examined for authenticity, relevance, consistency, and sufficient connection to the contributor and context.",
        signal: "Evidence gains reliability",
    },
    {
        number: "05",
        title: "Recognition",
        description:
            "A system or community becomes better able to understand and respond to the value represented by the contribution.",
        signal: "Value becomes recognizable",
    },
    {
        number: "06",
        title: "Participation",
        description:
            "Recognized contribution may inform trust, reputation, collaboration, responsibility, opportunity, ownership, or optional economic outcomes.",
        signal: "Recognition becomes actionable",
    },
] as const;

export default function ProofOfValue() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-400/[0.09] via-white/[0.025] to-cyan-400/[0.06] p-5 shadow-[0_30px_100px_rgba(124,58,237,0.08)] md:p-8">
            <figcaption>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-violet-200/70">
                        The Proof of Value Framework
                    </p>

                    <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
                        Contribution → Recognition
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

            <div className="relative mt-10">
                <div className="absolute bottom-8 left-[27px] top-8 hidden w-px bg-gradient-to-b from-violet-300/40 via-cyan-300/20 to-transparent md:block" />

                <div className="space-y-4">
                    {stages.map((stage, index) => (
                        <article
                            key={stage.title}
                            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-5 transition duration-300 hover:border-violet-200/20 hover:bg-white/[0.035] md:pl-20"
                        >
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-400/[0.035] to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />

                            <div className="relative">
                                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-200/20 bg-violet-300/[0.08] text-[10px] font-black tracking-[0.2em] text-violet-100/80 md:absolute md:-left-[60px] md:top-1/2 md:mb-0 md:-translate-y-1/2">
                                    {stage.number}
                                </div>

                                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                                    <div>
                                        <h4 className="font-black text-white">
                                            {stage.title}
                                        </h4>

                                        <p className="mt-2 text-sm leading-relaxed text-white/45">
                                            {stage.description}
                                        </p>
                                    </div>

                                    <div className="rounded-xl border border-cyan-200/10 bg-cyan-200/[0.035] px-4 py-3">
                                        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-200/40">
                                            System Effect
                                        </p>

                                        <p className="mt-2 text-xs font-semibold leading-relaxed text-cyan-50/65">
                                            {stage.signal}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {index < stages.length - 1 && (
                                <div className="absolute bottom-[-17px] left-1/2 hidden h-4 border-l border-dashed border-white/10 md:block" />
                            )}
                        </article>
                    ))}
                </div>
            </div>

            <div className="mt-9 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-violet-200/10 bg-black/25 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-violet-200/55">
                        What PoV Produces
                    </p>

                    <p className="mt-3 text-sm leading-relaxed text-white/50">
                        Structured and contextual evidence that may improve how
                        contribution is understood, attributed, verified, remembered, and
                        recognized.
                    </p>
                </div>

                <div className="rounded-2xl border border-amber-200/10 bg-black/25 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-200/55">
                        What PoV Does Not Produce
                    </p>

                    <p className="mt-3 text-sm leading-relaxed text-white/50">
                        A complete measurement of human worth, an automatic entitlement to
                        reward, or a universal price for every form of human activity.
                    </p>
                </div>
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-200/10 bg-gradient-to-r from-cyan-300/[0.045] via-white/[0.02] to-violet-300/[0.045] p-5 text-center">
                <p className="text-sm font-semibold leading-relaxed text-white/65">
                    Better evidence may support better recognition. Better recognition may
                    support more meaningful participation.
                </p>
            </div>
        </figure>
    );
}