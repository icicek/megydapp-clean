// components/essays/Identity.tsx

const identifiers = [
    {
        label: "Wallet",
        description: "A technical execution address",
        position:
            "md:absolute md:left-1/2 md:top-0 md:w-[190px] md:-translate-x-1/2",
    },
    {
        label: "Account",
        description: "A platform-specific access point",
        position:
            "md:absolute md:right-0 md:top-1/2 md:w-[190px] md:-translate-y-1/2",
    },
    {
        label: "Credential",
        description: "A record of qualification or authorization",
        position:
            "md:absolute md:bottom-0 md:left-1/2 md:w-[190px] md:-translate-x-1/2",
    },
    {
        label: "Username",
        description: "A social or application-level identifier",
        position:
            "md:absolute md:left-0 md:top-1/2 md:w-[190px] md:-translate-y-1/2",
    },
] as const;

const fragmentedRecords = [
    {
        title: "Wallet A",
        detail: "Contribution record A",
    },
    {
        title: "Wallet B",
        detail: "Contribution record B",
    },
    {
        title: "Account C",
        detail: "Participation record C",
    },
] as const;

const unifiedIdentifiers = [
    "Wallet A",
    "Wallet B",
    "Account C",
] as const;

export default function Identity() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.08] via-indigo-400/[0.035] to-violet-400/[0.07] p-5 shadow-[0_30px_100px_rgba(34,211,238,0.07)] md:p-8">
            <figcaption>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">
                        Identity as Persistent Context
                    </p>

                    <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
                        Identifiers → Continuity
                    </span>
                </div>

                <h3 className="mt-4 max-w-3xl text-2xl font-black leading-tight text-white md:text-3xl">
                    Identity does not replace identifiers. It connects participation
                    across them.
                </h3>

                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/50 md:text-base">
                    Wallets, accounts, credentials, and usernames may identify a person
                    within particular systems. Identity provides the persistent context
                    through which those separate points of interaction may become part of
                    one continuing participation history.
                </p>
            </figcaption>

            {/* Identity core */}
            <div className="mt-12">
                <div className="relative mx-auto md:h-[560px] md:max-w-[860px]">
                    {/* Desktop connector field */}
                    <div className="pointer-events-none absolute inset-0 hidden md:block">
                        <div className="absolute left-1/2 top-[95px] h-[135px] w-px -translate-x-1/2 bg-gradient-to-b from-cyan-300/45 to-cyan-300/10" />

                        <div className="absolute bottom-[95px] left-1/2 h-[135px] w-px -translate-x-1/2 bg-gradient-to-b from-indigo-300/10 to-indigo-300/45" />

                        <div className="absolute left-[190px] top-1/2 h-px w-[145px] -translate-y-1/2 bg-gradient-to-r from-cyan-300/45 to-cyan-300/10" />

                        <div className="absolute right-[190px] top-1/2 h-px w-[145px] -translate-y-1/2 bg-gradient-to-r from-indigo-300/10 to-indigo-300/45" />

                        <div className="absolute left-1/2 top-1/2 h-[330px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10" />

                        <div className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10" />
                    </div>

                    {/* Identifier cards */}
                    <div className="grid gap-4 md:block">
                        {identifiers.map((identifier) => (
                            <article
                                key={identifier.label}
                                className={[
                                    "relative z-10 rounded-2xl border border-white/10 bg-black/25 p-5 text-center backdrop-blur-sm",
                                    identifier.position,
                                ].join(" ")}
                            >
                                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/45">
                                    Identifier
                                </p>

                                <h4 className="mt-3 text-lg font-black text-white">
                                    {identifier.label}
                                </h4>

                                <p className="mt-2 text-xs leading-relaxed text-white/40">
                                    {identifier.description}
                                </p>
                            </article>
                        ))}
                    </div>

                    {/* Identity center */}
                    <div className="relative z-20 mx-auto mt-6 flex h-[240px] w-[240px] items-center justify-center rounded-full border border-cyan-200/25 bg-gradient-to-br from-cyan-300/[0.12] via-indigo-300/[0.08] to-violet-300/[0.12] shadow-[0_0_80px_rgba(34,211,238,0.12)] md:absolute md:left-1/2 md:top-1/2 md:mt-0 md:-translate-x-1/2 md:-translate-y-1/2">
                        <div className="absolute inset-4 rounded-full border border-white/10" />
                        <div className="absolute inset-10 rounded-full border border-dashed border-cyan-100/15" />

                        <div className="relative px-6 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-100/55">
                                Persistent Context
                            </p>

                            <h4 className="mt-4 text-3xl font-black tracking-tight text-white">
                                Identity
                            </h4>

                            <p className="mt-4 text-xs leading-relaxed text-white/50">
                                The continuity that connects actions, contribution,
                                recognition, and participation over time.
                            </p>
                        </div>
                    </div>

                    {/* Mobile identity explanation */}
                    <div className="mt-5 rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.035] p-5 text-center md:hidden">
                        <p className="text-sm font-semibold leading-relaxed text-white/60">
                            Identifiers may change. Identity preserves the continuity
                            through which participation remains understandable.
                        </p>
                    </div>
                </div>
            </div>

            {/* Without / With Identity */}
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
                {/* Without identity */}
                <section className="rounded-3xl border border-amber-200/10 bg-black/25 p-5 md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-amber-200/50">
                                Without Persistent Identity
                            </p>

                            <h4 className="mt-3 text-xl font-black text-white">
                                Participation remains fragmented
                            </h4>
                        </div>

                        <span className="rounded-full border border-amber-200/10 bg-amber-200/[0.035] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100/45">
                            Disconnected
                        </span>
                    </div>

                    <div className="mt-7 space-y-3">
                        {fragmentedRecords.map((record, index) => (
                            <div
                                key={record.title}
                                className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/10 bg-amber-200/[0.035] text-[10px] font-black text-amber-100/55">
                                        {String(index + 1).padStart(2, "0")}
                                    </div>

                                    <div>
                                        <p className="font-black text-white">
                                            {record.title}
                                        </p>

                                        <p className="mt-1 text-xs text-white/35">
                                            {record.detail}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-amber-200/10 bg-amber-200/[0.025] p-4">
                        <p className="text-sm leading-relaxed text-white/45">
                            Each record may be valid, yet the broader participation
                            history remains incomplete because the records are interpreted
                            separately.
                        </p>
                    </div>
                </section>

                {/* With identity */}
                <section className="rounded-3xl border border-cyan-200/15 bg-gradient-to-br from-cyan-300/[0.05] via-black/20 to-indigo-300/[0.045] p-5 md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-cyan-200/60">
                                With Persistent Identity
                            </p>

                            <h4 className="mt-3 text-xl font-black text-white">
                                Participation gains continuity
                            </h4>
                        </div>

                        <span className="rounded-full border border-cyan-200/15 bg-cyan-200/[0.045] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-100/55">
                            Connected
                        </span>
                    </div>

                    <div className="mt-7 rounded-2xl border border-cyan-200/15 bg-black/25 p-5">
                        <div className="flex items-center justify-center">
                            <div className="rounded-2xl border border-cyan-200/20 bg-cyan-200/[0.055] px-6 py-4 text-center">
                                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-cyan-100/45">
                                    Persistent Context
                                </p>

                                <p className="mt-2 text-lg font-black text-white">
                                    Identity
                                </p>
                            </div>
                        </div>

                        <div className="mx-auto h-6 w-px bg-cyan-200/20" />

                        <div className="grid gap-3 sm:grid-cols-3">
                            {unifiedIdentifiers.map((identifier) => (
                                <div
                                    key={identifier}
                                    className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-center text-xs font-semibold text-white/55"
                                >
                                    {identifier}
                                </div>
                            ))}
                        </div>

                        <div className="mx-auto h-6 w-px bg-cyan-200/20" />

                        <div className="rounded-2xl border border-indigo-200/15 bg-indigo-200/[0.04] p-4 text-center">
                            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-indigo-100/45">
                                Unified Participation History
                            </p>

                            <p className="mt-3 text-sm font-black text-white/75">
                                Contribution → Recognition → Participation
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.025] p-4">
                        <p className="text-sm leading-relaxed text-white/50">
                            Identity allows separate identifiers and interaction points
                            to be understood within one continuing participant context.
                        </p>
                    </div>
                </section>
            </div>

            {/* Final principle */}
            <div className="mt-6 overflow-hidden rounded-3xl border border-indigo-200/15 bg-gradient-to-r from-cyan-300/[0.045] via-indigo-300/[0.04] to-violet-300/[0.045] p-6 text-center md:p-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-100/50">
                    Identity Creates Continuity
                </p>

                <p className="mx-auto mt-4 max-w-3xl text-lg font-black leading-relaxed text-white/75 md:text-xl">
                    Identity is not valuable merely because it distinguishes a person.
                    It is valuable because it preserves the continuity through which
                    participation becomes understandable across time.
                </p>
            </div>
        </figure>
    );
}