// app/lexicon/content/contribution/Entry.tsx

import BookQuote from "@/components/docs/BookQuote";

const sectionTitleClass =
    "text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/60";

const paragraphClass =
    "space-y-6 text-[17px] leading-9 text-white/75";

export default function Entry() {
    return (
        <div className="space-y-14">
            <section>
                <p className={sectionTitleClass}>Definition</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Contribution is an action, capability, resource, insight, effort,
                        or other form of participation that meaningfully supports the
                        creation, improvement, coordination, or continuation of value.
                    </p>

                    <p>
                        Contributions may be individual or collective, direct or enabling,
                        visible or initially difficult to observe.
                    </p>
                </div>
            </section>

            <BookQuote>
                Value is often created collectively, even when economic outcomes are not
                distributed according to the same pattern.
            </BookQuote>

            <section>
                <p className={sectionTitleClass}>Meaningfully Measurable Contribution</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Levershare does not attempt to measure every meaningful human
                        action.
                    </p>

                    <p>
                        Some parts of life should remain outside economic calculation.
                    </p>

                    <p>
                        Meaningfully measurable contribution refers to contribution that
                        interacts with an ecosystem or economic activity and can be
                        observed, verified, and evaluated with sufficient responsibility.
                    </p>
                </div>
            </section>

            <section>
                <p className={sectionTitleClass}>Within Levershare</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Contribution is the bridge between human potential and
                        participation.
                    </p>

                    <p>
                        Potential may exist privately, but contribution begins when
                        developed capability interacts meaningfully with other people,
                        communities, systems, or economic activity.
                    </p>
                </div>
            </section>
        </div>
    );
}