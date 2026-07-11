// app/lexicon/content/recognition/Entry.tsx

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
                        Recognition is the capacity of a system or community to
                        meaningfully identify, understand, record, coordinate, and respond
                        to contribution.
                    </p>

                    <p>Recognition is not praise.</p>

                    <p>It is not popularity.</p>

                    <p>It is not agreement.</p>

                    <p>
                        It is the infrastructure through which contribution becomes legible
                        enough to participate in coordinated social or economic activity.
                    </p>
                </div>
            </section>

            <BookQuote>
                Recognition is not only a reward for contribution. It is infrastructure
                that allows contribution to participate.
            </BookQuote>

            <section>
                <p className={sectionTitleClass}>Why It Matters</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        What cannot be meaningfully observed is difficult to verify.
                    </p>

                    <p>What cannot be verified is difficult to record.</p>

                    <p>What cannot be recorded is difficult to coordinate.</p>

                    <p>
                        What cannot be coordinated rarely becomes economically
                        consequential.
                    </p>
                </div>
            </section>

            <section>
                <p className={sectionTitleClass}>Ethical Boundary</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Recognition should not attempt to calculate the total value of a
                        human being.
                    </p>

                    <p>Human worth is not a score.</p>

                    <p>
                        Responsible recognition focuses on contribution that can be
                        understood and evaluated without reducing the person to whatever is
                        easiest to measure.
                    </p>
                </div>
            </section>
        </div>
    );
}