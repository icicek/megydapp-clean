// components/essays/RecognitionEngine.tsx

const steps = [
    {
        number: "01",
        title: "Recognition",
        description: "Makes meaningful contribution visible.",
    },
    {
        number: "02",
        title: "Legibility",
        description: "Makes contribution understandable and readable by the system.",
    },
    {
        number: "03",
        title: "Coordination",
        description: "Allows people, institutions, and resources to organize around it.",
    },
    {
        number: "04",
        title: "Trust & Incentives",
        description: "Creates stronger expectations that participation may matter.",
    },
    {
        number: "05",
        title: "Participation",
        description: "Encourages more people to contribute, collaborate, and build.",
    },
    {
        number: "06",
        title: "Experimentation",
        description: "Expands the willingness to test new ideas and approaches.",
    },
    {
        number: "07",
        title: "Innovation",
        description: "Transforms experimentation into new knowledge and solutions.",
    },
    {
        number: "08",
        title: "Economic Expansion",
        description: "Broadens the range of value an economy can create and coordinate.",
    },
];

export default function RecognitionEngine() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.07] via-white/[0.025] to-purple-400/[0.06] p-5 md:p-8">
            <figcaption>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-200/60">
                    Recognition Engine
                </p>

                <h3 className="mt-3 max-w-2xl text-2xl font-black leading-tight text-white md:text-3xl">
                    How recognition can shape economic expansion
                </h3>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">
                    Recognition does not guarantee progress. It creates conditions through
                    which contribution can become legible, coordinated, trusted, and capable
                    of attracting participation.
                </p>
            </figcaption>

            <div className="relative mt-10">
                <div className="absolute bottom-6 left-[23px] top-6 hidden w-px bg-gradient-to-b from-cyan-300/40 via-cyan-300/15 to-purple-300/30 sm:block" />

                <div className="space-y-4">
                    {steps.map((step, index) => {
                        const isFirst = index === 0;
                        const isLast = index === steps.length - 1;

                        return (
                            <div
                                key={step.title}
                                className="group relative grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-5 transition duration-300 hover:border-cyan-300/25 hover:bg-white/[0.04] sm:grid-cols-[48px_1fr]"
                            >
                                <div
                                    className={[
                                        "relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl border text-xs font-black transition",
                                        isFirst
                                            ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100 shadow-[0_0_30px_rgba(103,232,249,0.12)]"
                                            : isLast
                                                ? "border-purple-300/35 bg-purple-300/10 text-purple-100"
                                                : "border-white/10 bg-zinc-950 text-white/40 group-hover:text-cyan-100",
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
        </figure>
    );
}