// components/essays/RecognitionGap.tsx

const stages = [
    {
        label: "Meaningful Contribution",
        state: "Value is created",
        strength: "full",
    },
    {
        label: "Visibility",
        state: "Only part becomes observable",
        strength: "high",
    },
    {
        label: "Recognition",
        state: "Only part becomes acknowledged",
        strength: "medium",
    },
    {
        label: "Participation",
        state: "Fewer pathways remain available",
        strength: "low",
    },
    {
        label: "Economic Outcome",
        state: "Outcome reflects only recognized value",
        strength: "minimal",
    },
] as const;

const widthClasses = {
    full: "w-full",
    high: "w-[82%]",
    medium: "w-[62%]",
    low: "w-[43%]",
    minimal: "w-[28%]",
};

export default function RecognitionGap() {
    return (
        <figure className="my-14 overflow-hidden rounded-3xl border border-amber-300/15 bg-gradient-to-br from-amber-300/[0.06] via-white/[0.02] to-red-400/[0.04] p-5 md:p-8">
            <figcaption>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/60">
                    The Recognition Gap
                </p>

                <h3 className="mt-3 max-w-2xl text-2xl font-black leading-tight text-white md:text-3xl">
                    Value can diminish as it moves through an incomplete recognition system
                </h3>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">
                    Contribution may begin at full strength while only a fraction becomes
                    visible, recognized, and economically consequential.
                </p>
            </figcaption>

            <div className="mt-10 space-y-6">
                {stages.map((stage, index) => (
                    <div key={stage.label}>
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black tracking-[0.22em] text-white/25">
                                    {String(index + 1).padStart(2, "0")}
                                </p>

                                <h4 className="mt-2 font-black text-white">
                                    {stage.label}
                                </h4>
                            </div>

                            <p className="max-w-[48%] text-right text-xs leading-relaxed text-white/35">
                                {stage.state}
                            </p>
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                            <div
                                className={[
                                    "h-full rounded-full bg-gradient-to-r from-cyan-300/80 via-amber-200/65 to-red-300/60",
                                    widthClasses[stage.strength],
                                ].join(" ")}
                            />
                        </div>

                        {index < stages.length - 1 && (
                            <div className="ml-5 mt-3 h-5 border-l border-dashed border-white/10" />
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-9 rounded-2xl border border-amber-200/10 bg-black/20 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-200/50">
                    The Lost Difference
                </p>

                <p className="mt-3 text-sm leading-relaxed text-white/50">
                    The gap between initial contribution and final economic outcome
                    represents value that may have been real, but insufficiently visible,
                    verifiable, or recognized.
                </p>
            </div>
        </figure>
    );
}