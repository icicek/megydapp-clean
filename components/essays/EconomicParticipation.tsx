// components/essays/EconomicParticipation.tsx

const dimensions = [
    {
        number: "01",
        title: "Access",
        description:
            "The ability to reach the tools, networks, knowledge, capital, and environments required to participate.",
    },
    {
        number: "02",
        title: "Capability",
        description:
            "The ability to develop and apply skills, knowledge, experience, creativity, and other forms of human potential.",
    },
    {
        number: "03",
        title: "Contribution",
        description:
            "The opportunity to express capability through activity that creates, improves, coordinates, or sustains value.",
    },
    {
        number: "04",
        title: "Recognition",
        description:
            "The ability of systems and communities to identify, understand, verify, and respond to meaningful contribution.",
    },
    {
        number: "05",
        title: "Participation",
        description:
            "The existence of real pathways through which recognized contribution can influence activity, opportunity, and outcomes.",
    },
    {
        number: "06",
        title: "Share in Value",
        description:
            "The possibility of receiving an appropriate economic outcome when contribution helps create or expand value.",
    },
] as const;

export default function EconomicParticipation() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.06] via-white/[0.02] to-cyan-400/[0.04] p-5 md:p-8">
            <figcaption>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200/60">
                    Economic Participation
                </p>

                <h3 className="mt-3 max-w-3xl text-2xl font-black leading-tight text-white md:text-3xl">
                    Economic participation requires more than the existence of economic
                    activity
                </h3>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">
                    People must be able to access economic systems, develop capabilities,
                    contribute meaningfully, receive recognition, and connect contribution
                    with real pathways for participation.
                </p>
            </figcaption>

            <div className="relative mt-10">
                <div className="absolute bottom-6 left-[19px] top-6 hidden border-l border-dashed border-white/10 sm:block" />

                <div className="space-y-4">
                    {dimensions.map((dimension) => (
                        <article
                            key={dimension.title}
                            className="relative rounded-2xl border border-white/10 bg-black/15 p-5 sm:pl-16"
                        >
                            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-200/[0.06] text-[10px] font-black tracking-[0.18em] text-emerald-100/70 sm:absolute sm:left-0 sm:top-1/2 sm:-translate-x-[1px] sm:-translate-y-1/2">
                                {dimension.number}
                            </div>

                            <div className="sm:pl-3">
                                <h4 className="font-black text-white">
                                    {dimension.title}
                                </h4>

                                <p className="mt-2 text-sm leading-relaxed text-white/45">
                                    {dimension.description}
                                </p>
                            </div>
                        </article>
                    ))}
                </div>
            </div>

            <div className="mt-9 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200/10 bg-black/20 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-200/50">
                        Participation Is Broader Than Employment
                    </p>

                    <p className="mt-3 text-sm leading-relaxed text-white/50">
                        Employment is one pathway, but people may also participate through
                        entrepreneurship, collaboration, ownership, community activity,
                        knowledge, creativity, coordination, and digital contribution.
                    </p>
                </div>

                <div className="rounded-2xl border border-cyan-200/10 bg-black/20 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-200/50">
                        Economic Outcome Is Not Human Worth
                    </p>

                    <p className="mt-3 text-sm leading-relaxed text-white/50">
                        Economic outcomes may reflect how systems respond to certain forms
                        of contribution. They do not measure the total worth, dignity, or
                        potential of a person.
                    </p>
                </div>
            </div>
        </figure>
    );
}