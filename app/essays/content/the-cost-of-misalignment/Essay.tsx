// app/essays/content/the-cost-of-misalignment/Essay.tsx

import BookQuote from "@/components/docs/BookQuote";

const sectionTitleClass =
    "scroll-mt-28 text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/55";

const paragraphClass = "space-y-8 text-[17px] leading-9 text-white/80";

export default function Essay() {
    return (
        <div className="space-y-10">
            {/* The Problem May Begin Earlier */}
            <section className="space-y-8">
                <h2 id="the-problem-may-begin-earlier" className={sectionTitleClass}>
                    The Problem May Begin Earlier
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Human potential may exist long before it becomes visible.
                    </p>

                    <p>It must first be discovered.</p>

                    <p>Developed.</p>

                    <p>Expressed.</p>

                    <p>And brought into contact with the world.</p>

                    <p>Only then can it become contribution.</p>

                    <p>
                        Yet even contribution does not automatically become recognition.
                    </p>

                    <p>
                        And recognition does not automatically become a meaningful economic
                        outcome.
                    </p>

                    <p>
                        Between what people contribute and what they eventually receive lies
                        one of the most consequential gaps in modern economic life.
                    </p>

                    <p>
                        <strong className="font-semibold text-white">Misalignment.</strong>
                    </p>

                    <p>
                        Income inequality has become one of the defining economic challenges
                        of modern civilization.
                    </p>

                    <p>Governments debate it.</p>

                    <p>Economists measure it.</p>

                    <p>International organizations document it.</p>

                    <p>Political movements form around it.</p>

                    <p>
                        Policies attempt to reduce it through taxation, transfers, public
                        services, education, regulation, and social protection.
                    </p>

                    <p>Many of these efforts have improved millions of lives.</p>

                    <p>Many remain essential.</p>

                    <p>
                        But they often begin after income has already been produced.
                    </p>

                    <p>After value has already been recognized.</p>

                    <p>After economic outcomes have already been assigned.</p>

                    <p>Perhaps this invites an earlier question.</p>
                </div>
            </section>

            <BookQuote>
                What if income inequality is not where the problem begins?
            </BookQuote>

            <section className="space-y-8">
                <div className={paragraphClass}>
                    <p>Income represents the final stage of a much longer process.</p>

                    <p>Before income exists, value must be created.</p>

                    <p>
                        Before value can produce an economic outcome, it must become visible.
                    </p>

                    <p>Before it can become visible, someone must recognize it.</p>

                    <p>
                        If recognition is incomplete, everything that follows may also be
                        incomplete.
                    </p>
                </div>
            </section>

            {/* Value Exists Before Income */}
            <section className="space-y-8">
                <h2 id="value-exists-before-income" className={sectionTitleClass}>
                    Value Exists Before Income
                </h2>

                <div className={paragraphClass}>
                    <p>Every modern product is the result of many contributions.</p>

                    <p>Every service.</p>

                    <p>Every scientific discovery.</p>

                    <p>Every technological breakthrough.</p>

                    <p>Every institution.</p>

                    <p>Every functioning city.</p>

                    <p>Some contributions are easy to observe.</p>

                    <p>Capital is visible.</p>

                    <p>Ownership is documented.</p>

                    <p>Formal authority is recorded.</p>

                    <p>Sales are counted.</p>

                    <p>Contracts are enforceable.</p>

                    <p>Other contributions are more difficult to see.</p>

                    <p>Ideas shared before a project formally begins.</p>

                    <p>Knowledge accumulated through years of experience.</p>

                    <p>Informal mentoring.</p>

                    <p>Community trust.</p>

                    <p>Early experimentation.</p>

                    <p>Connections between people who might never otherwise have met.</p>

                    <p>The quiet work that makes more visible work possible.</p>

                    <p>Value is often created collectively.</p>

                    <p>
                        Economic outcomes are not always distributed according to the same
                        pattern.
                    </p>
                </div>
            </section>

            <BookQuote>
                Income inequality may not begin where income is distributed. It may
                begin where contribution is recognized.
            </BookQuote>

            <section className="space-y-8">
                <div className={paragraphClass}>
                    <p>This does not mean every participant contributed equally.</p>

                    <p>
                        Nor does it mean every economic outcome should be equal.
                    </p>

                    <p>Capital matters.</p>

                    <p>Risk matters.</p>

                    <p>Leadership matters.</p>

                    <p>Scarcity matters.</p>

                    <p>Timing matters.</p>

                    <p>Responsibility matters.</p>

                    <p>Innovation matters.</p>

                    <p>
                        Markets must distinguish between different forms, degrees, and
                        consequences of contribution.
                    </p>

                    <p>The question is not whether differences should exist.</p>

                    <p>
                        The question is whether our systems are capable of recognizing
                        enough of the value that already does.
                    </p>
                </div>
            </section>

            {/* The Recognition Gap */}
            <section className="space-y-8">
                <h2 id="the-recognition-gap" className={sectionTitleClass}>
                    The Recognition Gap
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Economic systems can only coordinate what they can meaningfully
                        observe.
                    </p>

                    <p>What cannot be observed is difficult to verify.</p>

                    <p>What cannot be verified is difficult to record.</p>

                    <p>What cannot be recorded is difficult to recognize.</p>

                    <p>
                        What cannot be recognized rarely becomes part of an economic
                        outcome.
                    </p>

                    <p>
                        This produces what might be called a{" "}
                        <strong className="font-semibold text-white">
                            recognition gap
                        </strong>
                        .
                    </p>
                </div>

                <div className="overflow-hidden border-y border-white/10 py-10">
                    <div className="mx-auto max-w-xl space-y-3 text-center">
                        {[
                            "Meaningful Contribution",
                            "Incomplete Visibility",
                            "Incomplete Recognition",
                            "Incomplete Participation",
                            "Misaligned Economic Outcome",
                        ].map((step, index, steps) => (
                            <div key={step}>
                                <p className="text-lg font-semibold text-white/85 md:text-xl">
                                    {step}
                                </p>

                                {index < steps.length - 1 && (
                                    <p className="py-1 text-lg text-cyan-200/35">↓</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className={paragraphClass}>
                    <p>The gap does not always arise from exploitation.</p>

                    <p>Sometimes it does.</p>

                    <p>But often it arises from limitation.</p>

                    <p>
                        Earlier economies lacked the tools to observe complex networks of
                        contribution.
                    </p>

                    <p>
                        Institutions could recognize formal employment more easily than
                        informal knowledge sharing.
                    </p>

                    <p>They could record ownership more easily than influence.</p>

                    <p>
                        They could reward completed products more easily than the countless
                        enabling actions that made those products possible.
                    </p>

                    <p>
                        Economic systems did not necessarily ignore these contributions
                        deliberately.
                    </p>

                    <p>
                        Many were simply beyond their capacity to recognize reliably.
                    </p>

                    <p>That distinction matters.</p>

                    <p>It replaces accusation with a more useful question.</p>
                </div>
            </section>

            <BookQuote>
                Can modern systems recognize meaningfully measurable contribution more
                effectively than earlier systems could?
            </BookQuote>

            {/* What Should Never Be Measured */}
            <section className="space-y-8">
                <h2 id="what-should-never-be-measured" className={sectionTitleClass}>
                    What Should Never Be Measured
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Any attempt to expand recognition must begin with restraint.
                    </p>

                    <p>
                        No economic system can measure the full value of a human being.
                    </p>

                    <p>Nor should it try.</p>

                    <p>Human worth is not an economic variable.</p>

                    <p>Love should not require a ledger.</p>

                    <p>Friendship should not become a transaction.</p>

                    <p>Parenthood cannot be reduced to a score.</p>

                    <p>
                        Compassion does not become more meaningful because an algorithm
                        records it.
                    </p>

                    <p>Some contributions belong to families.</p>

                    <p>Some belong to friendships.</p>

                    <p>Some belong to communities.</p>

                    <p>Some belong to the private meaning of a life.</p>

                    <p>They should remain outside economic calculation.</p>

                    <p>
                        Levershare therefore does not begin with the ambition to measure
                        everything.
                    </p>

                    <p>It focuses on a narrower category.</p>

                    <p>
                        <strong className="font-semibold text-white">
                            Meaningfully measurable contribution.
                        </strong>
                    </p>

                    <p>
                        Contribution that already interacts with economic or ecosystem
                        activity.
                    </p>

                    <p>
                        Contribution that can be observed with sufficient reliability.
                    </p>

                    <p>
                        Contribution whose recognition may improve participation without
                        attempting to define total human value.
                    </p>
                </div>
            </section>

            <BookQuote>
                Better recognition does not require measuring everything. It requires
                becoming more precise about what can be measured responsibly.
            </BookQuote>

            {/* Misalignment Changes Behaviour */}
            <section className="space-y-8">
                <h2 id="misalignment-changes-behaviour" className={sectionTitleClass}>
                    Misalignment Changes Behaviour
                </h2>

                <div className={paragraphClass}>
                    <p>
                        The cost of misalignment is not limited to unfair outcomes.
                    </p>

                    <p>It also shapes expectations.</p>

                    <p>
                        When people repeatedly observe that meaningful contribution produces
                        little recognition, they learn something from the system.
                    </p>

                    <p>They may contribute less.</p>

                    <p>Experiment less.</p>

                    <p>Share fewer ideas.</p>

                    <p>Take fewer creative risks.</p>

                    <p>Invest less in developing their abilities.</p>

                    <p>Withdraw from participation altogether.</p>

                    <p>The opposite may also be true.</p>

                    <p>
                        When people believe that meaningful contribution has a greater chance
                        of becoming visible and producing meaningful outcomes, their
                        relationship with participation begins to change.
                    </p>

                    <p>They become more willing to learn.</p>

                    <p>To experiment.</p>

                    <p>To collaborate.</p>

                    <p>To build.</p>

                    <p>To invest in themselves.</p>

                    <p>To contribute before success is guaranteed.</p>

                    <p>Recognition therefore influences more than reward.</p>

                    <p>
                        It influences the willingness to participate in the first place.
                    </p>
                </div>

                <div className="overflow-hidden border-y border-white/10 py-10">
                    <div className="mx-auto max-w-xl space-y-3 text-center">
                        {[
                            "Better Recognition",
                            "Greater Trust",
                            "Deeper Participation",
                            "More Experimentation",
                            "More Innovation",
                            "Broader Prosperity",
                        ].map((step, index, steps) => (
                            <div key={step}>
                                <p className="text-lg font-semibold text-white/85 md:text-xl">
                                    {step}
                                </p>

                                {index < steps.length - 1 && (
                                    <p className="py-1 text-lg text-cyan-200/35">↓</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className={paragraphClass}>
                    <p>
                        This is why misalignment is not merely a distribution problem.
                    </p>

                    <p>It can become a participation problem.</p>

                    <p>
                        And when participation falls, the whole economy loses contributions
                        that might otherwise have become knowledge, services, companies,
                        technologies, institutions, or solutions.
                    </p>
                </div>
            </section>

            {/* The Invisible Cost */}
            <section className="space-y-8">
                <h2 id="the-invisible-cost" className={sectionTitleClass}>
                    The Invisible Cost
                </h2>

                <div className={paragraphClass}>
                    <p>The visible cost of misalignment appears in statistics.</p>

                    <p>Income distribution.</p>

                    <p>Wealth concentration.</p>

                    <p>Limited mobility.</p>

                    <p>Unequal access to opportunity.</p>

                    <p>The invisible cost is more difficult to measure.</p>

                    <p>
                        It consists of everything that never entered economic life.
                    </p>

                    <p>
                        The person who never developed a valuable capability because no
                        credible path appeared before them.
                    </p>

                    <p>
                        The idea never tested because its creator expected no meaningful
                        recognition.
                    </p>

                    <p>The collaboration that never formed.</p>

                    <p>The business never attempted.</p>

                    <p>The research never pursued.</p>

                    <p>The solution never created.</p>

                    <p>
                        Essay No. 02 explored the conditions through which human potential
                        may become visible.
                    </p>

                    <p>Here, the question moves one stage further.</p>

                    <p>
                        What happens when visible potential becomes meaningful contribution,
                        yet the systems around it remain unable to recognize it?
                    </p>

                    <p>The loss belongs first to the individual.</p>

                    <p>But it rarely ends there.</p>

                    <p>
                        When a person&apos;s contribution never reaches its possible
                        expression, communities lose value.
                    </p>

                    <p>Markets lose innovation.</p>

                    <p>Institutions lose insight.</p>

                    <p>Societies lose productive capacity.</p>

                    <p>Civilization loses possibilities it may never know existed.</p>
                </div>
            </section>

            <BookQuote>
                Perhaps the world&apos;s greatest untapped economic resource is not
                hidden capital. Perhaps it is meaningful human contribution that never
                becomes meaningful economic participation.
            </BookQuote>

            {/* Beyond the Present Limits */}
            <section className="space-y-8">
                <h2 id="beyond-the-present-limits" className={sectionTitleClass}>
                    Beyond the Present Limits
                </h2>

                <div className={paragraphClass}>
                    <p>This argument is not a rejection of markets.</p>

                    <p>
                        Markets remain among humanity&apos;s most powerful coordination
                        achievements.
                    </p>

                    <p>They connect needs with resources.</p>

                    <p>Ideas with capital.</p>

                    <p>Producers with consumers.</p>

                    <p>Risk with reward.</p>

                    <p>But markets have never been static.</p>

                    <p>
                        They evolve as human beings develop better institutions, better
                        information, and better tools for coordination.
                    </p>

                    <p>
                        Double-entry bookkeeping expanded what commerce could coordinate.
                    </p>

                    <p>
                        Legal corporations expanded what groups could build together.
                    </p>

                    <p>
                        Patent systems changed how invention could be protected.
                    </p>

                    <p>
                        Digital networks reduced the cost of global collaboration.
                    </p>

                    <p>
                        Each development allowed economic systems to recognize and coordinate
                        something they previously handled less effectively.
                    </p>

                    <p>Modern technologies may create another opportunity.</p>

                    <p>Not to replace markets.</p>

                    <p>Not to eliminate uncertainty.</p>

                    <p>Not to guarantee perfect outcomes.</p>

                    <p>
                        But to reduce certain forms of misalignment by improving how
                        contribution can be observed, verified, recorded, and recognized.
                    </p>
                </div>
            </section>

            {/* The Levershare Question */}
            <section className="space-y-8">
                <h2 id="the-levershare-question" className={sectionTitleClass}>
                    The Levershare Question
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Levershare does not claim that perfect alignment is possible.
                    </p>

                    <p>It almost certainly is not.</p>

                    <p>Every system will contain uncertainty.</p>

                    <p>Every measurement will remain partial.</p>

                    <p>Every recognition model will require revision.</p>

                    <p>The objective is not perfection.</p>

                    <p>It is progressive improvement.</p>

                    <p>
                        Levershare asks whether modern technologies can help bring
                        meaningfully measurable contribution and economic outcomes closer
                        together.
                    </p>

                    <p>Whether contribution can become more visible.</p>

                    <p>Whether recognition can become more transparent.</p>

                    <p>Whether participation can become more consequential.</p>

                    <p>
                        Whether people can gain additional pathways to influence their
                        economic outcomes through what they meaningfully contribute.
                    </p>

                    <p>This is not only a question about fairness.</p>

                    <p>It is also a question about human potential.</p>

                    <p>
                        Because when contribution is more likely to become visible, more
                        people may become willing to develop and express the abilities they
                        already possess.
                    </p>

                    <p>When recognition improves, participation may deepen.</p>

                    <p>When participation deepens, innovation may expand.</p>

                    <p>
                        And when more people can participate meaningfully, economic progress
                        may become broader than it was before.
                    </p>
                </div>
            </section>

            <BookQuote>
                Better alignment does not promise equal outcomes. It seeks to expand the
                number of people who have a meaningful opportunity to create them.
            </BookQuote>

            {/* An Earlier Place to Begin */}
            <section className="space-y-8">
                <h2 id="an-earlier-place-to-begin" className={sectionTitleClass}>
                    An Earlier Place to Begin
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Income inequality will continue to require serious policy attention.
                    </p>

                    <p>Distribution matters.</p>

                    <p>Taxation matters.</p>

                    <p>Public services matter.</p>

                    <p>Social protection matters.</p>

                    <p>
                        But perhaps a more complete conversation should begin earlier.
                    </p>

                    <p>Before income is distributed.</p>

                    <p>Before outcomes become fixed.</p>

                    <p>
                        Before contribution disappears into an economic process that cannot
                        fully see it.
                    </p>

                    <p>
                        Perhaps it should begin where human potential becomes contribution.
                    </p>

                    <p>Where contribution becomes visible.</p>

                    <p>Where visibility becomes recognition.</p>

                    <p>And where recognition begins shaping participation.</p>

                    <p>Levershare does not claim to know the final answer.</p>

                    <p>It begins with a narrower conviction.</p>

                    <p>
                        If economic outcomes are imperfectly aligned with meaningful
                        contribution, improving recognition may be one place worth beginning.
                    </p>

                    <p>Not because the future is predictable.</p>

                    <p>
                        But because humanity may now possess tools capable of asking—and
                        testing—better questions than ever before.
                    </p>
                </div>
            </section>
        </div>
    );
}