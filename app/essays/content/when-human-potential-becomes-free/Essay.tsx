//app/essays/content/when-human-potential-becomes-free/Essay.tsx

// app/essays/content/when-human-potential-becomes-free/Essay.tsx

import BookQuote from "@/components/docs/BookQuote";

const sectionTitleClass =
    "scroll-mt-28 text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/55";

const paragraphClass =
    "space-y-8 text-[17px] leading-9 text-white/80";

export default function Essay() {
    return (
        <div className="space-y-10">
            {/* The Hidden Resource */}
            <section className="space-y-8">
                <h2 id="the-hidden-resource" className={sectionTitleClass}>
                    The Hidden Resource
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Humanity has spent centuries learning how to discover hidden
                        resources.
                    </p>

                    <p>
                        We learned to find gold beneath mountains, oil beneath oceans, and
                        minerals beneath deserts.
                    </p>

                    <p>
                        Entire civilizations were transformed by revealing resources that
                        had always existed but remained invisible until the right tools
                        emerged.
                    </p>

                    <p>The resources themselves were never created.</p>

                    <p>They were simply discovered.</p>

                    <p>
                        Perhaps humanity has now arrived at a different kind of discovery.
                    </p>

                    <p>Not beneath the earth.</p>

                    <p>But within ourselves.</p>
                </div>
            </section>

            <BookQuote>
                Perhaps humanity&apos;s greatest untapped resource has always been human
                potential.
            </BookQuote>

            {/* Waiting for the Conditions */}
            <section className="space-y-8">
                <h2 id="waiting-for-the-conditions" className={sectionTitleClass}>
                    Waiting for the Conditions
                </h2>

                <div className={paragraphClass}>
                    <p>Seeds do not wait for permission to grow.</p>

                    <p>They wait for rain.</p>

                    <p>For light.</p>

                    <p>For fertile soil.</p>

                    <p>
                        For the conditions that allow what already exists to emerge.
                    </p>

                    <p>Perhaps human potential is not so different.</p>

                    <p>
                        Every human being enters the world carrying possibilities that have
                        never existed before and will never exist again in exactly the same
                        way.
                    </p>

                    <p>Not identical talents.</p>

                    <p>Not identical experiences.</p>

                    <p>Not identical ways of thinking.</p>

                    <p>
                        Every person represents a unique combination of abilities waiting
                        to be discovered, developed, and expressed.
                    </p>

                    <p>Some eventually become visible.</p>

                    <p>Many never do.</p>

                    <p>Not because they lacked potential.</p>

                    <p>
                        But because the conditions capable of revealing that potential
                        never fully came together.
                    </p>
                </div>
            </section>

            <BookQuote>
                The greatest barrier to human potential has rarely been the absence of
                talent. More often, it has been the absence of conditions.
            </BookQuote>

            {/* The Lives We Never Saw */}
            <section className="space-y-8">
                <h2 id="the-lives-we-never-saw" className={sectionTitleClass}>
                    The Lives We Never Saw
                </h2>

                <div className={paragraphClass}>
                    <p>History remembers extraordinary individuals.</p>

                    <p>Scientists.</p>

                    <p>Teachers.</p>

                    <p>Artists.</p>

                    <p>Builders.</p>

                    <p>Engineers.</p>

                    <p>Entrepreneurs.</p>

                    <p>Physicians.</p>

                    <p>Inventors.</p>

                    <p>We celebrate the people who changed the world.</p>

                    <p>
                        We rarely think about those who never had the opportunity to
                        discover what they might have become.
                    </p>

                    <p>Not because they lacked ability.</p>

                    <p>
                        But because the conditions that could have revealed it never
                        existed.
                    </p>

                    <p>
                        How many remarkable lives remained invisible simply because no
                        environment allowed them to unfold?
                    </p>

                    <p>No civilization can answer that question.</p>

                    <p>But perhaps every civilization should ask it.</p>
                </div>
            </section>

            <BookQuote>
                The greatest prison is not where people lose their freedom. It is where
                they never discover the potential they were free to become.
            </BookQuote>

            {/* Becoming What We Can Be */}
            <section className="space-y-8">
                <h2 id="becoming-what-we-can-be" className={sectionTitleClass}>
                    Becoming What We Can Be
                </h2>

                <div className={paragraphClass}>
                    <p>
                        For centuries, philosophers have suggested that living beings
                        possess an inner tendency toward fulfillment.
                    </p>

                    <p>
                        Aristotle described this idea through <em>telos</em>—the natural
                        movement of a living being toward becoming what it has the capacity
                        to become.
                    </p>

                    <p>
                        An acorn does not become an oak because someone promises it a
                        reward.
                    </p>

                    <p>It grows because growth belongs to its nature.</p>

                    <p>Its future unfolds from within.</p>

                    <p>Human beings are different.</p>

                    <p>
                        Unlike an acorn, we are not born with a single predetermined path.
                    </p>

                    <p>We carry many possible talents.</p>

                    <p>Many possible directions.</p>

                    <p>Many possible futures.</p>

                    <p>
                        Perhaps one of the deepest responsibilities of being human is
                        discovering which of those possibilities genuinely belong to us.
                    </p>

                    <p>
                        Levershare does not claim that realizing one&apos;s potential is the
                        only path to a meaningful life.
                    </p>

                    <p>
                        It explores the possibility that many people experience a deeper
                        sense of fulfillment when they are able to discover, develop, and
                        express the talents that are uniquely their own.
                    </p>
                </div>
            </section>

            <BookQuote>
                Human potential is not locked. It is waiting for the right conditions.
            </BookQuote>

            {/* From Talent to Participation */}
            <section className="space-y-8">
                <h2 id="from-talent-to-participation" className={sectionTitleClass}>
                    From Talent to Participation
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Potential is therefore not something we manufacture.
                    </p>

                    <p>It already exists.</p>

                    <p>
                        What often remains missing is the journey that allows it to become
                        visible.
                    </p>
                </div>

                <div className="overflow-hidden border-y border-white/10 py-10">
                    <div className="mx-auto max-w-xl space-y-3 text-center">
                        {[
                            "Talent",
                            "Discovery",
                            "Potential Becomes Visible",
                            "Development",
                            "Expression",
                            "Self-Actualization",
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

                        <div className="pt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/30">
                                Optional
                            </p>

                            <p className="py-2 text-lg text-cyan-200/35">↓</p>

                            <p className="text-lg font-semibold text-cyan-100/80 md:text-xl">
                                Economic Participation
                            </p>
                        </div>
                    </div>
                </div>

                <div className={paragraphClass}>
                    <p>Every stage matters.</p>

                    <p>Discovery without development changes little.</p>

                    <p>Development without expression remains invisible.</p>

                    <p>
                        Expression allows potential to interact with the world and become
                        contribution.
                    </p>

                    <p>Economic participation may emerge from this process.</p>

                    <p>But it is not the purpose of the process.</p>

                    <p>
                        Some people will express their potential through science.
                    </p>

                    <p>Others through entrepreneurship.</p>

                    <p>Teaching.</p>

                    <p>Art.</p>

                    <p>Medicine.</p>

                    <p>Engineering.</p>

                    <p>Parenthood.</p>

                    <p>Community leadership.</p>

                    <p>Public service.</p>

                    <p>
                        Or simply by living lives that reflect who they truly are.
                    </p>

                    <p>A meaningful life does not require economic success.</p>

                    <p>
                        Economic participation is one possible expression of human
                        potential.
                    </p>

                    <p>Not its purpose.</p>
                </div>
            </section>

            <BookQuote>
                A better economy is not one that tells people what to become. It is one
                that allows more people to become who they already have the potential to
                be.
            </BookQuote>

            {/* The Internal Advantage */}
            <section className="space-y-8">
                <h2 id="the-internal-advantage" className={sectionTitleClass}>
                    The Internal Advantage
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Throughout history, competitive advantage has often come from
                        external resources.
                    </p>

                    <p>Land.</p>

                    <p>Capital.</p>

                    <p>Machines.</p>

                    <p>Information.</p>

                    <p>Technology.</p>

                    <p>
                        Each technological revolution made more of these advantages
                        accessible to more people.
                    </p>

                    <p>
                        In the age of artificial intelligence, perhaps the remaining
                        advantage becomes increasingly internal.
                    </p>

                    <p>
                        <strong className="font-semibold text-white">
                            Human potential.
                        </strong>
                    </p>

                    <p>
                        As powerful technologies become widely available, the question
                        gradually changes.
                    </p>

                    <p>Not: “Who has access to better tools?”</p>

                    <p>
                        But: “Who is able to use those tools in ways that reflect something
                        uniquely human?”
                    </p>

                    <p>
                        Perhaps the defining advantage of the coming decades will not simply
                        be intelligence.
                    </p>

                    <p>It will be originality.</p>

                    <p>Judgment.</p>

                    <p>Creativity.</p>

                    <p>Purpose.</p>

                    <p>
                        The qualities that emerge most naturally when people build upon
                        their own unique strengths.
                    </p>
                </div>
            </section>

            <BookQuote>
                Civilizations become wealthier when more human potential becomes
                economically visible.
            </BookQuote>

            {/* Discovery Infrastructure */}
            <section className="space-y-8">
                <h2 id="discovery-infrastructure" className={sectionTitleClass}>
                    Discovery Infrastructure
                </h2>

                <div className={paragraphClass}>
                    <p>
                        For thousands of years, civilization has built infrastructures that
                        move things.
                    </p>

                    <p>Roads move people.</p>

                    <p>Ports move goods.</p>

                    <p>Banks move capital.</p>

                    <p>The internet moves information.</p>

                    <p>Each transformed human civilization.</p>

                    <p>
                        Perhaps the next great infrastructure should serve a different
                        purpose.
                    </p>

                    <p>Not moving resources.</p>

                    <p>Not moving information.</p>

                    <p>
                        But helping more human beings discover the value already waiting
                        within themselves.
                    </p>

                    <p>
                        Such an infrastructure would not exist to tell people who they
                        should become.
                    </p>

                    <p>
                        It would exist to help more people discover who they already have
                        the potential to become.
                    </p>

                    <p>
                        Education would naturally become one of its first foundations.
                    </p>

                    <p>
                        Not education understood merely as the transfer of information.
                    </p>

                    <p>But education as discovery.</p>

                    <p>As exploration.</p>

                    <p>As guidance.</p>

                    <p>
                        As the process through which people gradually recognize their own
                        strengths before deciding how they wish to develop them.
                    </p>

                    <p>
                        Mentorship, artificial intelligence, global digital networks,
                        blockchain, cryptography, and immersive technologies may all support
                        such an environment.
                    </p>

                    <p>None of them creates human potential.</p>

                    <p>
                        Their value lies in helping humanity organize better conditions
                        around it.
                    </p>
                </div>
            </section>

            <BookQuote>
                Civilizations built infrastructures for transportation, communication,
                finance, and information. Perhaps the next infrastructure should help
                humanity discover itself.
            </BookQuote>

            {/* Technology and Self-Discovery */}
            <section className="space-y-8">
                <h2 id="technology-and-self-discovery" className={sectionTitleClass}>
                    Technology and Self-Discovery
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Artificial intelligence is not merely changing how humans work.
                    </p>

                    <p>
                        It is changing how quickly people must discover what they can
                        uniquely contribute.
                    </p>

                    <p>
                        When powerful tools become accessible to almost everyone, access to
                        tools alone becomes less differentiating.
                    </p>

                    <p>
                        The ability to ask original questions, exercise judgment, combine
                        experience, recognize unmet needs, and create meaning becomes more
                        important.
                    </p>

                    <p>
                        Technology should not assign people a purpose.
                    </p>

                    <p>
                        It should help create conditions in which people can discover one
                        for themselves.
                    </p>

                    <p>
                        Every major technological revolution has expanded what humanity
                        could do.
                    </p>

                    <p>
                        Perhaps the next one should also expand humanity&apos;s ability to
                        discover who it already is.
                    </p>
                </div>
            </section>

            <BookQuote>
                The purpose of technology is not to replace human potential. It is to
                help create the conditions in which human potential can discover itself.
            </BookQuote>

            {/* A Question for Maslow */}
            <section className="space-y-8">
                <h2 id="a-question-for-maslow" className={sectionTitleClass}>
                    A Question for Maslow
                </h2>

                <div className={paragraphClass}>
                    <p>
                        This perspective may also invite us to revisit one of
                        psychology&apos;s most influential ideas.
                    </p>

                    <p>
                        Abraham Maslow proposed that people seek fulfillment by progressively
                        realizing their own potential.
                    </p>

                    <p>
                        If future societies become better at helping people discover and
                        develop that potential, might they also become better equipped to
                        satisfy many of the needs represented throughout Maslow&apos;s
                        hierarchy?
                    </p>

                    <p>
                        Could greater self-discovery improve not only fulfillment, but also a
                        person&apos;s ability to create value, participate economically, and
                        strengthen their material security?
                    </p>

                    <p>Perhaps.</p>

                    <p>Perhaps not.</p>

                    <p>The question deserves exploration before certainty.</p>
                </div>
            </section>

            {/* The Levershare Question */}
            <section className="space-y-8">
                <h2 id="the-levershare-question" className={sectionTitleClass}>
                    The Levershare Question
                </h2>

                <div className={paragraphClass}>
                    <p>This is the possibility Levershare exists to explore.</p>

                    <p>Not because every form of human value can be measured.</p>

                    <p>It cannot.</p>

                    <p>
                        Not because every meaningful contribution should become an economic
                        transaction.
                    </p>

                    <p>It should not.</p>

                    <p>
                        But because enabling more people to discover, develop, express, and
                        demonstrate the unique potential they already possess may also expand
                        humanity&apos;s capacity to contribute, create, innovate, and
                        flourish.
                    </p>

                    <p>
                        Levershare explores whether modern technologies can be organized
                        into a discovery infrastructure that makes these journeys more
                        accessible.
                    </p>

                    <p>It does not seek to define human purpose.</p>

                    <p>
                        It seeks to help create the conditions in which more people can
                        discover their own.
                    </p>

                    <p>
                        The purpose is not to build an economy around technology.
                    </p>

                    <p>Nor even around markets.</p>

                    <p>
                        The purpose is to help build conditions in which more human beings
                        are free to become who they already have the potential to be.
                    </p>

                    <p>Economic participation is one possible consequence.</p>

                    <p>Human flourishing remains the destination.</p>
                </div>
            </section>

            <BookQuote>
                Every major technological revolution expanded what humanity could do.
                Perhaps the next one should help more people discover who they are.
            </BookQuote>

            {/* Closing */}
            <section className="space-y-8">
                <h2 id="a-different-kind-of-discovery" className={sectionTitleClass}>
                    A Different Kind of Discovery
                </h2>

                <div className={paragraphClass}>
                    <p>
                        Perhaps the future will not belong only to societies that build more
                        intelligent machines.
                    </p>

                    <p>
                        It may belong to societies that help more human beings discover the
                        intelligence, creativity, judgment, experience, and purpose already
                        waiting within themselves.
                    </p>

                    <p>
                        Humanity has spent centuries searching beneath the earth for hidden
                        value.
                    </p>

                    <p>
                        Perhaps the next century will be remembered for helping humanity
                        discover the value that has quietly been waiting within itself all
                        along.
                    </p>
                </div>
            </section>
        </div>
    );
}