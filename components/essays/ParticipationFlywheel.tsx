// components/essays/ParticipationFlywheel.tsx

const stages = [
    {
        number: "01",
        title: "Better Recognition",
        description: "Meaningful contribution has a stronger chance of being seen.",
    },
    {
        number: "02",
        title: "Greater Trust",
        description:
            "Participants gain confidence that their efforts may produce meaningful consequences.",
    },
    {
        number: "03",
        title: "Deeper Participation",
        description:
            "More people become willing to contribute, collaborate, and invest in themselves.",
    },
    {
        number: "04",
        title: "More Experimentation",
        description:
            "Stronger expectations encourage creative risk-taking and new attempts.",
    },
    {
        number: "05",
        title: "More Innovation",
        description:
            "Experimentation creates additional knowledge, services, and solutions.",
    },
    {
        number: "06",
        title: "Broader Prosperity",
        description:
            "More contributors can expand the range of value available to society.",
    },
];

export default function ParticipationFlywheel() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.06] via-white/[0.02] to-cyan-300/[0.05] p-5 md:p-8">
            <figcaption>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200/60">
                    The Participation Flywheel
                </p>

                <h3 className="mt-3 max-w-2xl text-2xl font-black leading-tight text-white md:text-3xl">
                    Recognition can influence whether participation expands or contracts
                </h3>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">
                    When people expect meaningful contribution to matter, recognition may
                    generate a reinforcing cycle of trust, participation, experimentation,
                    and innovation.
                </p>
            </figcaption>

            <div className="relative mt-10 grid gap-4 md:grid-cols-2">
                {stages.map((stage, index) => (
                    <div
                        key={stage.title}
                        className="group relative rounded-2xl border border-white/10 bg-black/20 p-5 transition duration-300 hover:border-emerald-300/25 hover:bg-white/[0.04]"
                    >
                        <div className="flex items-start gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-zinc-950 text-xs font-black text-emerald-100/70">
                                {stage.number}
                            </span>

                            <div>
                                <h4 className="font-black text-white">{stage.title}</h4>

                                <p className="mt-2 text-sm leading-relaxed text-white/50">
                                    {stage.description}
                                </p>
                            </div>
                        </div>

                        {index < stages.length - 1 && (
                            <span className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-zinc-950 text-xs text-cyan-200/45 md:hidden">
                                ↓
                            </span>
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl border border-dashed border-cyan-300/15 bg-cyan-300/[0.03] p-5 text-center">
                <span className="text-lg text-cyan-200/45">↻</span>

                <p className="text-sm font-semibold leading-relaxed text-white/55">
                    Broader prosperity can create stronger conditions for future
                    recognition and participation.
                </p>
            </div>
        </figure>
    );
}