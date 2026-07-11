// app/lexicon/content/human-potential/Entry.tsx

import Link from "next/link";
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
                        Human potential is the capacity within a person to discover,
                        develop, and express talents, abilities, knowledge, experience,
                        creativity, judgment, and other meaningful forms of human
                        capability.
                    </p>

                    <p>
                        In Levershare, human potential is not treated as something created
                        by an institution, market, or technology.
                    </p>

                    <p>It already exists within people.</p>

                    <p>
                        The central question is whether the conditions exist through which
                        that potential can become visible.
                    </p>
                </div>
            </section>

            <BookQuote>
                Human potential does not need to be created. It needs the conditions
                through which it can become visible.
            </BookQuote>

            <section>
                <p className={sectionTitleClass}>What It Is Not</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>Human potential is not the total economic value of a person.</p>

                    <p>It is not a score.</p>

                    <p>It is not a promise of success.</p>

                    <p>
                        It does not imply that every talent must become a profession,
                        transaction, or source of income.
                    </p>

                    <p>
                        Economic participation is one possible expression of developed
                        human potential—not its sole purpose.
                    </p>
                </div>
            </section>

            <section>
                <p className={sectionTitleClass}>Within Levershare</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Human potential sits at the center of the Levershare ecosystem.
                    </p>

                    <p>
                        Education, discovery, contribution, recognition, Proof of Value,
                        Personal Value Currency, and other ecosystem layers are designed
                        around the possibility that more people may gain better conditions
                        to discover and express what they are capable of becoming.
                    </p>
                </div>
            </section>

            <section className="border-t border-white/10 pt-8">
                <p className={sectionTitleClass}>Further Reading</p>

                <Link
                    href="/essays/when-human-potential-becomes-visible"
                    className="group mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200/70 transition hover:text-cyan-100"
                >
                    Essay No. 02 — When Human Potential Becomes Visible
                    <span className="transition group-hover:translate-x-1">→</span>
                </Link>
            </section>
        </div>
    );
}