// components/essays/DiscoveryJourney.tsx

const coreSteps = [
    {
        number: "01",
        title: "Talent",
        description:
            "A natural ability, inclination, experience, or strength already present within the person.",
    },
    {
        number: "02",
        title: "Discovery",
        description:
            "The person begins to recognize abilities that may previously have remained invisible.",
    },
    {
        number: "03",
        title: "Potential Becomes Visible",
        description:
            "Talent becomes understandable as a possibility that can be developed.",
    },
    {
        number: "04",
        title: "Development",
        description:
            "Education, practice, guidance, and experience strengthen what has been discovered.",
    },
    {
        number: "05",
        title: "Expression",
        description:
            "Developed potential begins interacting with the world through action and creation.",
    },
    {
        number: "06",
        title: "Self-Actualization",
        description:
            "The person moves closer to expressing abilities that feel authentically their own.",
    },
];

export default function DiscoveryJourney() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.07] via-white/[0.025] to-emerald-400/[0.05] p-5 md:p-8">
            <figcaption>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-200/60">
                    The Discovery Journey
                </p>

                <h3 className="mt-3 max-w-2xl text-2xl font-black leading-tight text-white md:text-3xl">
                    How hidden talent can become visible human potential
                </h3>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">
                    Potential is not created by the system. The system can only help create
                    the conditions through which it is discovered, developed, and
                    expressed.
                </p>
            </figcaption>

            <div className="relative mt-10">
                <div className="absolute bottom-6 left-[44px] top-6 z-0 hidden w-px bg-gradient-to-b from-cyan-300/45 via-cyan-300/15 to-emerald-300/30 sm:block" />

                <div className="relative z-10 space-y-4">
                    {coreSteps.map((step, index) => {
                        const isFirst = index === 0;
                        const isLast = index === coreSteps.length - 1;

                        return (
                            <div
                                key={step.title}
                                className="group relative grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-5 transition duration-300 hover:border-cyan-300/25 hover:bg-white/[0.04] sm:grid-cols-[48px_1fr]"
                            >
                                <div
                                    className={[
                                        "relative z-20 flex h-12 w-12 items-center justify-center rounded-2xl border bg-zinc-950 text-xs font-black transition",
                                        isFirst
                                            ? "border-cyan-300/40 text-cyan-100 shadow-[0_0_30px_rgba(103,232,249,0.12)]"
                                            : isLast
                                                ? "border-emerald-300/35 text-emerald-100 shadow-[0_0_30px_rgba(110,231,183,0.08)]"
                                                : "border-white/10 text-white/40 group-hover:border-cyan-300/20 group-hover:text-cyan-100",
                                    ].join(" ")}
                                >
                                    {step.number}
                                </div>

                                <div className="min-w-0">
                                    <h4 className="text-lg font-black text-white">
                                        {step.title}
                                    </h4>

                                    <p className="mt-2 text-sm leading-relaxed text-white/50">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-purple-300/20 bg-purple-300/[0.04] p-5 md:ml-[68px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-purple-200/55">
                    Optional Economic Layer
                </p>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-300/25 bg-zinc-950 text-purple-100">
                        ↳
                    </span>

                    <div>
                        <h4 className="font-black text-white">Economic Participation</h4>

                        <p className="mt-2 text-sm leading-relaxed text-white/50">
                            Realized potential may create economic outcomes where the person
                            chooses and where meaningful participation is possible.
                        </p>
                    </div>
                </div>
            </div>
        </figure>
    );
}