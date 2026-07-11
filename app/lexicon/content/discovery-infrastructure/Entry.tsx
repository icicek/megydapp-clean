// app/lexicon/content/discovery-infrastructure/Entry.tsx

import BookQuote from "@/components/docs/BookQuote";
import DiscoveryJourney from "@/components/essays/DiscoveryJourney";

const sectionTitleClass =
    "text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/60";

const paragraphClass = "space-y-6 text-[17px] leading-9 text-white/75";

export default function Entry() {
    return (
        <div className="space-y-14">
            {/* Definition */}
            <section>
                <p className={sectionTitleClass}>Definition</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Discovery Infrastructure is a coordinated ecosystem designed to help
                        more people discover, develop, express, and apply the potential they
                        already possess.
                    </p>

                    <p>
                        It is not a single platform, technology, school, marketplace, or
                        protocol.
                    </p>

                    <p>
                        It is the broader set of conditions through which human capability
                        can become easier to recognize, strengthen, demonstrate, and connect
                        with meaningful opportunities.
                    </p>

                    <p>
                        These conditions may include education, mentorship, artificial
                        intelligence, digital identity, community, proof systems,
                        collaboration environments, reputation, and economic pathways.
                    </p>
                </div>
            </section>

            <BookQuote>
                Civilizations built infrastructures for transportation, communication,
                finance, and information. Perhaps the next infrastructure should help
                humanity discover itself.
            </BookQuote>

            {/* Why Infrastructure */}
            <section>
                <p className={sectionTitleClass}>Why Infrastructure?</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Human potential does not become visible through motivation alone.
                    </p>

                    <p>
                        A person may possess valuable abilities without access to education,
                        guidance, tools, networks, confidence, or environments in which those
                        abilities can be tested.
                    </p>

                    <p>
                        Infrastructure matters because individual effort always operates
                        within surrounding conditions.
                    </p>

                    <p>
                        Roads make movement easier.
                    </p>

                    <p>
                        Communication networks make information exchange easier.
                    </p>

                    <p>
                        Financial infrastructure makes capital coordination easier.
                    </p>

                    <p>
                        Discovery Infrastructure aims to make self-discovery, development,
                        expression, recognition, and participation easier.
                    </p>
                </div>
            </section>

            {/* Journey */}
            <DiscoveryJourney />

            {/* What It Includes */}
            <section>
                <p className={sectionTitleClass}>What It May Include</p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {[
                        {
                            title: "Education",
                            description:
                                "Access to learning experiences that help people discover and develop capabilities.",
                        },
                        {
                            title: "Mentorship",
                            description:
                                "Guidance from people able to recognize strengths, gaps, and possible directions.",
                        },
                        {
                            title: "Artificial Intelligence",
                            description:
                                "Tools that support personalized learning, experimentation, creation, and reflection.",
                        },
                        {
                            title: "Digital Identity",
                            description:
                                "A persistent connection between a person, their actions, learning, and contribution history.",
                        },
                        {
                            title: "Proof Systems",
                            description:
                                "Mechanisms that help certain forms of contribution become verifiable and durable.",
                        },
                        {
                            title: "Community",
                            description:
                                "Social environments where people can learn, collaborate, test ideas, and receive feedback.",
                        },
                        {
                            title: "Opportunity",
                            description:
                                "Pathways through which developed capability can interact with real needs and real activity.",
                        },
                        {
                            title: "Economic Participation",
                            description:
                                "Optional ways for people to generate economic outcomes through meaningful contribution.",
                        },
                    ].map((item) => (
                        <article
                            key={item.title}
                            className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
                        >
                            <h3 className="font-black text-white">{item.title}</h3>

                            <p className="mt-3 text-sm leading-relaxed text-white/50">
                                {item.description}
                            </p>
                        </article>
                    ))}
                </div>
            </section>

            {/* What It Is Not */}
            <section>
                <p className={sectionTitleClass}>What It Is Not</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Discovery Infrastructure is not a system for assigning people a
                        purpose.
                    </p>

                    <p>
                        It should not tell individuals who they must become.
                    </p>

                    <p>
                        It should not rank total human worth.
                    </p>

                    <p>
                        It should not assume that every talent must produce income.
                    </p>

                    <p>
                        Its purpose is to expand the conditions through which people can
                        make better-informed choices about their own development.
                    </p>
                </div>
            </section>

            <BookQuote>
                Technology should not tell people who they are. It should help create the
                conditions in which they can discover it for themselves.
            </BookQuote>

            {/* Why Now */}
            <section>
                <p className={sectionTitleClass}>Why Now?</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        For most of history, building discovery infrastructure at global
                        scale was technically and economically difficult.
                    </p>

                    <p>
                        Education depended heavily on geography.
                    </p>

                    <p>
                        Mentorship depended on personal networks.
                    </p>

                    <p>
                        Contribution histories remained fragmented.
                    </p>

                    <p>
                        Reputation rarely moved between institutions or communities.
                    </p>

                    <p>
                        New technologies are beginning to change those limitations.
                    </p>

                    <p>
                        Artificial intelligence can support personalized learning and
                        experimentation.
                    </p>

                    <p>
                        Global networks can connect learners, educators, mentors, and
                        collaborators across geography.
                    </p>

                    <p>
                        Cryptographic and distributed systems can help preserve identity,
                        proof, and contribution history.
                    </p>

                    <p>
                        Immersive technologies may create new environments for practice,
                        simulation, and shared experience.
                    </p>

                    <p>
                        No single technology creates Discovery Infrastructure.
                    </p>

                    <p>
                        The opportunity lies in organizing them around human development.
                    </p>
                </div>
            </section>

            {/* Within Levershare */}
            <section>
                <p className={sectionTitleClass}>Within Levershare</p>

                <div className={`mt-6 ${paragraphClass}`}>
                    <p>
                        Levershare approaches Discovery Infrastructure as a long-term
                        ecosystem objective.
                    </p>

                    <p>
                        Its purpose is not simply to help people consume information.
                    </p>

                    <p>
                        It is to help more people discover capabilities, develop them through
                        meaningful activity, express them through contribution, and connect
                        that contribution with recognition and opportunity.
                    </p>

                    <p>
                        Education is expected to become one of the first major foundations
                        of this infrastructure.
                    </p>

                    <p>
                        Over time, additional layers may include mentorship, collaboration,
                        proof, reputation, identity, community, contribution systems, and
                        optional economic participation.
                    </p>
                </div>
            </section>

            <BookQuote>
                Levershare exists to design the conditions under which more human
                potential can become visible.
            </BookQuote>
        </div>
    );
}